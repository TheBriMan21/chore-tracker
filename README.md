# Chore Tracker

A simple household chore tracker in a single HTML file. No install, no server.

- Each chore has who it is assigned to, how often it repeats, and when it was last done (and by whom).
- Overdue and due chores sort to the top. Press **Done** to check one off.
- Filter by person, edit chores and people, and see a history of check-offs.

## Sign-in and permissions

With Firebase set up, everyone signs in with Google. The family list (People → Who can sign in) says who gets in:

- **Parents** can add, edit and delete chores and people, and manage who can sign in.
- **Kids** can only check chores off.
- Anyone else sees "You're not on the family list yet".

The first person to sign in after the rules are published becomes the first parent. These limits are enforced by the database rules in `firestore.rules`, not just the app.

## Using it

Open `index.html` in any browser. Data is saved in that browser (localStorage), so each device keeps its own list. Use **Export backup** / **Import backup** to move data between devices.

## Sharing across devices (Firebase)

1. Create a project at <https://console.firebase.google.com> and add a **Firestore Database** (production mode).
2. **Build → Authentication → Get started → Sign-in method → Google → Enable**.
3. **Authentication → Settings → Authorized domains → Add domain**: the site's domain (e.g. `yourname.github.io`).
4. **Project settings → Your apps → Web (</>)**: copy `apiKey`, `authDomain`, `projectId`, `appId` into `FIREBASE_CONFIG` in `index.html`.
5. **Firestore → Rules**: paste the contents of `firestore.rules` and **Publish**. Then sign in right away so you become the first parent.

## Weekly email report

Every Sunday at 3 PM Eastern, a GitHub Action (`.github/workflows/weekly-report.yml`) emails each parent on the family list a summary of the past 7 days: completion rate, all-done days, and a day-by-day grid. Press **Run workflow** on the Actions tab to send one right away.

It needs three repository secrets (Settings → Secrets and variables → Actions):

- `FIREBASE_SERVICE_ACCOUNT`: Firebase console → Project settings → Service accounts → **Generate new private key**; paste the whole JSON file.
- `GMAIL_USER`: the Gmail address that sends the report.
- `GMAIL_APP_PASSWORD`: a Google [app password](https://myaccount.google.com/apppasswords) for that address (needs 2-Step Verification).
