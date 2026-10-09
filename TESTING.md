# Testing Agriflow

A hands-on checklist for trying every part of the app on your own computer.
Tick things off as you go and note anything that looks wrong.

## 1. Start everything

Open four terminals in the project folder:

| Terminal | Command | What it is | Needed for |
| --- | --- | --- | --- |
| 1 | `npm run dev` | The app, at http://localhost:3000 | Everything |
| 2 | `ollama serve` (skip if Ollama is already running in the tray) | The N-ATLaS AI model | AI chat and insights |
| 3 | `npm run asr` | Speech-to-text | Speaking to the AI |
| 4 | `npm run tts` | YarnGPT voices (slow on this laptop) | Nigerian-voice replies |

Only terminal 1 is required. Without the others, the AI page shows them as
*Offline* and the app falls back to the browser's own voice features.

Check the AI side first: `npm run ai:check`.

## 2. Make your accounts

You need two people to test roles. Use a normal window for the owner and a
private/incognito window (or another browser) for the worker.

1. **Owner:** go to http://localhost:3000/signup and create your account. The
   first account takes over the sample farm (batches, feed, money already filled in).
2. **Worker:** on **Team**, copy the join **Link** or code (or click **Invite Member**). In the
   private window, open the link (or go to `/join`), and sign up with a different email.
3. Optional **manager:** invite a third account, then as the owner click the pencil on its
   card on **Team** and change the role to Manager.

Use made-up emails like `worker1@example.test`. Nothing is emailed.

## 3. Checklist

### Sign-in and security
- [ ] Wrong password shows an error; the right one logs you in.
- [ ] "Remember me" keeps you signed in after closing the browser.
- [ ] Signing out, then visiting http://localhost:3000/finances, sends you to the login page.
- [ ] The password never appears in the address bar.

### Dashboard
- [ ] Figures, charts and alerts load; the bell shows notifications.
- [ ] As the **worker**, no money figures appear anywhere on the dashboard.

### Production
- [ ] Create a batch (ID is suggested automatically, e.g. `POU-…-003`).
- [ ] Open the batch and add a daily record (weight, feed, deaths); the charts update.
- [ ] Change the batch status, then delete a test batch.

### Feed & Inventory
- [ ] Add an item, log a delivery, update a stock count.
- [ ] Set stock low and check it turns red ("Running out soon") and appears in the bell.
- [ ] A delivery with a cost shows up in **Finances** as an expense.

### Finances (owner/manager only)
- [ ] Add income and expense transactions; the four totals update.
- [ ] Filter All / Income / Expenses; **Export** downloads a CSV that opens in Excel.
- [ ] **Fin Calc.** works.
- [ ] As the **worker**, Finances isn't in the menu and the page says you don't have access.

### Analytics
- [ ] Charts and insights load; numbers match what you entered.

### Meetings
- [ ] Schedule a meeting with attendees; it appears under upcoming and in the bell.

### Team
- [ ] Worker appears after joining. With the pencil button: change role, assign batches,
      set Access to Suspended (they can no longer get in), remove.
- [ ] **Regenerate** the join code; the old code stops working.

### Multi-farm
- [ ] **My Farms** → add a second farm; switch farms from the header.
- [ ] Data from one farm never shows on the other.
- [ ] **Overview** totals both farms.

### AI
- [ ] On **AI**, the status list shows what's connected.
- [ ] Ask "How is my farm doing this month?"; the answer uses your real numbers.
      Wait about 30 seconds after opening the AI page the first time (the model
      loads in the background); after that answers start within a few seconds.
- [ ] With **Auto language**, type a question in Yoruba, Hausa or Igbo; the answer
      comes back in the same language, with that language's button highlighted.
- [ ] Press **EN / HA / IG / YO** under an answer to switch its language; pressing
      one you've already seen switches instantly.
- [ ] Pick a language in the chat's language box, reload the page: it's still picked.
- [ ] Tap the microphone, speak a question, and check it's transcribed correctly.
- [ ] Press **Listen** on an answer. With `npm run tts` running it uses a Nigerian
      voice in the language shown. "Preparing audio" counts up (about 30 seconds
      for a short answer), then the whole answer plays without stopping.
      **Stop** cuts it off.
- [ ] On the AI page, pick a voice for each language and press **Try**.
- [ ] Change a setting on the AI page; "Saved" appears without pressing a button.
- [ ] As a worker, the AI doesn't reveal money figures.

### Phone-size screens
- [ ] In Chrome press `F12`, then the phone icon (or `Ctrl+Shift+M`), choose a phone
      size and click through every page. The bottom menu should replace the sidebar.

## 4. Reporting problems

For each problem note: the page, which account (owner/worker), what you did,
what you expected and what happened. A screenshot helps. The terminal running
`npm run dev` usually shows the error too.

## 5. Starting over

Your data lives in `.data/agriflow.db`. To reset to the sample farm:

1. Stop `npm run dev`.
2. Copy `.data/agriflow.db` somewhere safe if you want to keep it.
3. Delete `.data/agriflow.db` (and any `agriflow.db-wal` / `-shm` files next to it).
4. Start `npm run dev` again and sign up fresh.
