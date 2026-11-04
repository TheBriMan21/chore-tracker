# Chore Tracker

A simple household chore tracker in a single HTML file. No install, no server.

- Each chore has who it is assigned to, how often it repeats, and when it was last done (and by whom).
- Overdue and due chores sort to the top. Press **Done** to check one off.
- Filter by person, edit chores and people, and see a history of check-offs.

## Using it

Open `index.html` in any browser. Data is saved in that browser (localStorage), so each device keeps its own list. Use **Export backup** / **Import backup** to move data between devices.

## Sharing across devices (Firebase)

Out of the box each device keeps its own list. To share one list across every phone, iPad and laptop, the app can sync through a free Firebase Firestore database:

1. Go to <https://console.firebase.google.com>, click **Create a project** (any name, Google Analytics off is fine).
2. In the project, open **Build → Firestore Database → Create database**. Pick a nearby location and start in **production mode**.
3. On the **Rules** tab, replace the rules with the block below and click **Publish**.
4. Go to **Project settings** (gear icon) → **Your apps** → the **</>** (Web) button. Register an app (no hosting needed) and copy the `firebaseConfig` values.
5. Paste `apiKey`, `authDomain`, `projectId` and `appId` into `FIREBASE_CONFIG` near the bottom of `index.html`.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /households/{id} {
      allow read, write: if true;
    }
  }
}
```

The footer shows "Synced across devices" when it's connected. The first device to connect uploads its list; after that every device shares it.

Note: the Firebase config is not a secret, but these rules mean anyone who has it could edit the chore list. That's fine for a chore list; don't store anything sensitive in it.
