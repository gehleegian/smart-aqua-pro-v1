# Support messaging and Gmail delivery

SmartAqua Pro support conversations are stored in Cloud Firestore under
`support_threads/{threadId}/messages/{messageId}`. Firestore is the source of
truth for both the user and administrator inboxes.

When a user creates a message, the `queueSupportMessageEmail` Cloud Function
creates a server-authored document in the `mail` collection. Configure the
official Firebase **Trigger Email** extension to watch that collection and use
the SmartAqua Pro Gmail account's SMTP settings. Browser clients cannot read or
write `mail` documents.

## Deployment configuration

1. The Cloud Functions string parameter `SMARTAQUA_SUPPORT_EMAIL` defaults to
   `smartaquapro98@gmail.com`. Override it during deployment only if the
   official support mailbox changes.
2. Install the Firebase Trigger Email extension and set its email document
   collection to `mail`.
3. Configure the extension's SMTP connection with the SmartAqua Pro Gmail
   account. Use a Google app password or an approved mail provider credential;
   never place this credential in Vite environment variables or source control.
4. Deploy Firestore rules, Cloud Functions, and the web application.
5. Send a test message from a verified User account. Confirm the conversation
   appears in the Admin Support Messages page and the email reaches Gmail.
6. Reply from the Admin Support Messages page. Confirm the User page shows the
   real-time reply and unread indicator.

## Why replies happen inside SmartAqua Pro

The email is an administrator alert and copy of the user's message. The admin
should reply from the authenticated SmartAqua Pro inbox. This keeps the reply
linked to the correct user and ticket, enforces role-based access, and provides
reliable in-app unread notifications.

Synchronizing replies sent directly from Gmail would require a separate Gmail
API OAuth installation, Pub/Sub watch renewal, MIME parsing, and reliable
matching of email headers to ticket IDs. That can be added later, but it is a
more fragile and security-sensitive workflow than replying in the admin inbox.

## Conversation deletion

Deletion is per inbox. When a user deletes a conversation, it disappears only
from that user's chat list and remains available to the administrator. An admin
deletion similarly removes only the admin copy. On the Firebase Spark plan this
is implemented as a rules-protected visibility update, so hidden records remain
stored in Firestore. A future trusted retention job can purge records hidden by
both participants after the project is upgraded to Blaze.
