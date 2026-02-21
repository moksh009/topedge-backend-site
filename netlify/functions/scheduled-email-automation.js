
import { schedule } from '@netlify/functions';
import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccountJson) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccountJson))
      });
    } else {
      console.warn('FIREBASE_SERVICE_ACCOUNT_KEY not set');
    }
  } catch (error) {
    console.error('Firebase init error:', error);
  }
}

const db = admin.firestore();

const API_BASE_URL =
  process.env.VITE_EMAIL_API_BASE_URL ||
  process.env.EMAIL_API_BASE_URL ||
  'https://topedge-backend.netlify.app';

export const automationLogic = async (event, context, customBaseUrl) => {
  const baseUrl = customBaseUrl || API_BASE_URL;
  console.log(`Starting scheduled email automation... (baseUrl: ${baseUrl})`);
  const logs = [];
  let emailsSent = 0;

  try {
    // 0. Check for Scheduled Admin Announcements (Broadcasts)
    try {
      const announcementsSnap = await db.collection('system_announcements')
        .where('status', '==', 'pending')
        .where('scheduledAt', '<=', admin.firestore.Timestamp.now())
        .limit(1) // Process one at a time to avoid timeouts
        .get();

      if (!announcementsSnap.empty) {
        const announcementDoc = announcementsSnap.docs[0];
        const announcement = announcementDoc.data();
        logs.push(`Processing announcement: ${announcement.title}`);

        // Get all users for broadcast
        const allUsersSnap = await db.collection('users').get();
        let broadcastCount = 0;

        for (const userDoc of allUsersSnap.docs) {
          const user = userDoc.data();
          if (user.email) {
            try {
              await fetch(`${baseUrl}/api/send-community-update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  email: user.email,
                  title: announcement.title,
                  content: announcement.content,
                  ctaText: announcement.ctaText,
                  ctaLink: announcement.ctaLink
                })
              });
              broadcastCount++;
            } catch (e) {
              console.error(`Failed to send broadcast to ${user.email}`, e);
            }
          }
        }

        await announcementDoc.ref.update({
          status: 'sent',
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          sentCount: broadcastCount
        });
        logs.push(`Broadcast sent to ${broadcastCount} users.`);
      }
    } catch (announcementError) {
      console.error('Failed to process announcements (possible missing index):', announcementError.message);
      logs.push(`Skipped announcements due to error: ${announcementError.message}`);
    }

    // Main Engagement Loop - Iterate 'users' to capture those who haven't created a profile yet
    const usersSnapshot = await db.collection('users').get();
    const now = new Date();

    // Log the run
    logs.push(`Found ${usersSnapshot.size} users to process for engagement.`);

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const uid = userDoc.id;

      // Fetch public profile to check completion status
      const profileSnap = await db.collection('public_profiles').doc(uid).get();
      const profile = profileSnap.exists ? profileSnap.data() : {};

      // Determine Email
      const email = userData.email || profile.email;

      if (!email) {
        // Attempt to get from Auth as last resort
        try {
          const userRecord = await admin.auth().getUser(uid);
          if (userRecord.email) {
            // Update user record for next time
            await db.collection('users').doc(uid).set({ email: userRecord.email }, { merge: true });
          }
        } catch (e) {
          // logs.push(`Skipping ${uid}: No email found.`);
          continue;
        }
        continue; // Skip for this run if still no email
      }

      // Handle Dates
      let createdAt = now;
      const createdSource = userData.createdAt || profile.createdAt;

      if (createdSource) {
        // Handle Firestore Timestamp, ISO string, or Date object
        if (typeof createdSource.toDate === 'function') {
          createdAt = createdSource.toDate();
        } else {
          createdAt = new Date(createdSource);
        }
      }

      const daysSinceJoined = (now.getTime() - createdAt.getTime()) / (1000 * 3600 * 24);
      const isProfileComplete = Boolean(
        (profile.description || profile.bio) &&
        profile.aiSkills &&
        profile.aiSkills.length > 0 &&
        profile.location
      );

      const updates = {};
      let needsUpdate = false;

      // --- LOGIC ---

      // 1. Profile Reminder (If incomplete)
      if (!isProfileComplete) {
        const reminderCount = profile.profileReminderSentCount || 0;

        // Reminder 1: After 2 days (48 hours)
        if (daysSinceJoined >= 2 && reminderCount === 0) {
          try {
            logs.push(`Sending Profile Reminder 1 to ${email}`);
            await fetch(`${baseUrl}/api/send-profile-reminder`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, name: userData.name || profile.fullName || 'Builder', daysAgo: Math.floor(daysSinceJoined) })
            });
            updates.profileReminderSentCount = 1;
            updates.lastProfileReminderSentAt = admin.firestore.FieldValue.serverTimestamp();
            needsUpdate = true;
            emailsSent++;
          } catch (e) {
            logs.push(`Failed to send Reminder 1 to ${email}: ${e.message}`);
          }
        }
        // Reminder 2: After 4 days (2 days after first reminder approx)
        else if (daysSinceJoined >= 4 && reminderCount === 1) {
          try {
            logs.push(`Sending Profile Reminder 2 to ${email}`);
            await fetch(`${baseUrl}/api/send-profile-reminder`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, name: userData.name || profile.fullName || 'Builder', daysAgo: Math.floor(daysSinceJoined) })
            });
            updates.profileReminderSentCount = 2;
            updates.lastProfileReminderSentAt = admin.firestore.FieldValue.serverTimestamp();
            needsUpdate = true;
            emailsSent++;
          } catch (e) {
            logs.push(`Failed to send Reminder 2 to ${email}: ${e.message}`);
          }
        }
      }

      // 2. Resource Nudge (One email, after 1 day of being complete)
      // User asked for: "4. one email of resource posting remainder"
      if (isProfileComplete) {
        const nudgeCount = profile.resourceNudgeSentCount || 0;

        // Send ONLY ONE email
        if (nudgeCount === 0) {
          const resourcesSnap = await db.collection('community_resources').where('userId', '==', uid).limit(1).get();
          const hasResources = !resourcesSnap.empty;

          // Check if it's been at least 1 day since joined (or since completion if we tracked it, but joined is safe proxy)
          // This avoids sending immediately upon signup if they complete profile fast.
          if (!hasResources && daysSinceJoined >= 1) {
            try {
              logs.push(`Sending Resource Nudge to ${email}`);
              await fetch(`${baseUrl}/api/send-resource-nudge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, name: userData.name || profile.fullName || 'Builder' })
              });
              updates.resourceNudgeSentCount = 1;
              updates.lastResourceNudgeSentAt = admin.firestore.FieldValue.serverTimestamp();
              needsUpdate = true;
              emailsSent++;
            } catch (e) {
              logs.push(`Failed to send Resource Nudge to ${email}: ${e.message}`);
            }
          }
        }
      }

      if (needsUpdate) {
        // If public profile doesn't exist, this will create it with just the tracking info
        await db.collection('public_profiles').doc(uid).set(updates, { merge: true });
      }
    }

    // Save System Log
    await db.collection('system_logs').add({
      type: 'daily_email_automation',
      status: 'success',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      emailsSent,
      details: logs
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Automation run complete', emailsSent, logs }),
      logs
    };

  } catch (error) {
    console.error('Automation error:', error);
    await db.collection('system_logs').add({
      type: 'daily_email_automation',
      status: 'error',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      error: error.message
    });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

// Run every day at 12:30 PM IST (07:00 AM UTC)
export const handler = schedule('0 7 * * *', automationLogic);
