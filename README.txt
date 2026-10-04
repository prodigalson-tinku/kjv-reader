KJV READER - Stage 5 (Google Drive sync)
==============================

HOW TO OPEN ON YOUR MAC RIGHT NOW (no internet or account needed)
1. Unzip the download (double-click the .zip file).
2. Open the folder "kjv-reader".
3. Double-click "index.html". It opens in your browser. That's it.
   (Works without internet. Nothing is sent anywhere.)
   Keep the "data" folder beside index.html.

PUTTING IT ONLINE SO IT CAN BE INSTALLED (one time, about 15 minutes)
Hosting only holds the app files (public-domain Bible text). Your notes never go online.
1. Make a free account at github.com (Sign up). Pick a plain username: it becomes part
   of your app's web address. Confirm your email when GitHub asks.
2. Click the + at the top right, then "New repository".
   Name it:  kjv-reader     Choose: Public     Tick: "Add a README file"
   Click "Create repository".
3. In the new repository click "Add file", then "Upload files".
4. On your Mac, unzip kjv-reader.zip and open the kjv-reader folder.
   Select EVERYTHING INSIDE it (index.html, app.js, style.css, sw.js, manifest.webmanifest,
   README.txt, and the folders "data" and "icons") and drag it all onto the GitHub page.
   (Drag the contents, not the kjv-reader folder itself.)
   Wait until every file shows as uploaded (the data folder is large; give it a minute).
5. Scroll down and click "Commit changes".
6. Click "Settings" (top of the repository), then "Pages" (left side).
   Under "Build and deployment" set Source = "Deploy from a branch",
   Branch = "main", folder = "/ (root)", then click Save.
7. Wait 1-2 minutes and refresh that page. It will show:
   "Your site is live at https://YOURNAME.github.io/kjv-reader/"
   Open that address. That is your app.

INSTALLING
- Mac:     Safari: File > Add to Dock.   Chrome: the install icon in the address bar.
- iPhone:  open the address in SAFARI (not Chrome), tap the Share button, then
           "Add to Home Screen". Open the app from the new icon.
- Android: open the address in Chrome, tap the three dots, then "Install app".
Do this on Wi-Fi: the first visit saves the whole Bible and cross-references on the device.
After that it works with no internet.

MOVING YOUR NOTES (important)
Each place the app runs has its own separate notes. The copy you opened from a file,
the copy in Safari, and the installed home-screen copy do NOT share notes.
  1. In the old copy: My notes, highlights & links > Export backup (saves a .json file).
  2. Get that file to the new device (AirDrop, email it to yourself, Files, Drive).
  3. In the new copy: My notes, highlights & links > Import backup > choose the file.
On iPhone, install to the Home Screen FIRST, then import into the installed app.
Export a fresh backup now and then. It also moves notes between your devices.

UPDATING LATER
When I give you a new version: unzip it, repeat steps 3-5 (Add file > Upload files, drag the
contents, Commit). Next time you open the app it says "A new version is ready": tap Update now.
Your notes are kept.

GOOGLE DRIVE SYNC (new) - keeps all your devices in step automatically
What it does: your notes, highlights and links are kept in one small file in YOUR Google
Drive ("KJV Reader notes (sync).json"). Each device merges with it, so edits made on your Mac
appear on your phones and the other way round. Deletions travel too. The app can only see the
file it makes (not the rest of your Drive). Drive also keeps older versions of that file.
It only works once the app is hosted online (see PUTTING IT ONLINE), not from a double-click file.

SET-UP (once, about 10 minutes, on a computer)
  The app shows these steps itself: Aa > Google Drive sync > Set up > "How to get a Client ID".
  1. console.cloud.google.com : sign in, create a project called KJV Reader.
  2. APIs & Services > Library > "Google Drive API" > Enable.
  3. OAuth consent screen (may be called Google Auth Platform): app name KJV Reader, your email,
     Audience = External.
  4. Data access / Scopes: add  .../auth/drive.file  and save.
  5. Audience: click "Publish app". (If you leave it in Testing, add your own email as a test user.)
  6. Credentials > Create credentials > OAuth client ID > Web application. Paste the two
     addresses the app shows you (Authorized JavaScript origin, Authorized redirect URI).
  7. Copy the Client ID. In the app: Aa > Google Drive sync > Set up, paste it, tap
     "Save and sign in with Google". Do the same on each device with the SAME Client ID.
  Tip: if you send the Client ID to whoever built this app, it can be built in so that
  nobody has to type it on each device.

USING IT
- A small cloud appears at the top: green = in step, amber = waiting for you to sign in or
  offline, blue = syncing, red = a problem (tap Aa > Google Drive sync to read it).
- Changes upload by themselves a few seconds after you make them, and the app checks again
  whenever you come back to it.
- Google only lets an app stay signed in for about an hour, and requires a tap to renew.
  So now and then the cloud turns amber: tap it, approve, and everything catches up.
- If two devices change the same note, the newest edit wins.
- Offline is fine: edits are kept on the device and sync when you are back online.
- If the sign-in window will not open (some phones), use "Sign in another way".
- Use the SAME Client ID on every device. A different one starts a separate cloud file.
- Export backup still works and is still a good second safety net.

CROSS-REFERENCES AND THE VERSE PANEL
- Tap a verse NUMBER, then press "Refs" in the bottom bar. A panel opens for that verse:
    * See also    = passages this verse points to, best first, with the text shown
    * Cited by    = verses that point to this one
    * My links    = links you have made yourself (see below)
    * Notes       = your notes on this verse, and a button to add one
- Tap any reference in the list: the text jumps there and the panel re-centres on it,
  so you can follow a chain from verse to verse. "Back" retraces your steps one at a time.
- "Copy list" copies the references as text, for sermon notes.
- On a phone the panel slides up from the bottom; the small arrow shrinks it out of the way.
  On a Mac it sits on the right, with the contents tree on the left.

MAKING YOUR OWN LINKS
- Open the panel on a verse, choose "My links", type a reference (Rom 5:8, Isa 53:4-6,
  Ps 23) and an optional reason, then "Add link".
- Or: shrink the panel, browse anywhere in the text, tap verse numbers, expand the panel
  and press "Link to selected verses".
- Your links show in the target verse's panel too, marked "linked from".
- Your links are included in Export/Import backup, like your notes.

SOURCE OF THE CROSS-REFERENCES
- OpenBible.info cross-reference data (CC-BY licence), about 341,000 references,
  ranked by community votes. Attribution: www.openbible.info
- The three dots beside a reference show how strongly the community rated it.

HIGHLIGHTS AND NOTES
- Tap a word to select it. Tap a second word in the same verse to select everything
  between them. (On a Mac you can also drag the mouse across words, or double-click one.)
- Tap a verse NUMBER to select the whole verse; tap more numbers to add verses.
- A bar appears at the bottom:
    * coloured dots  = highlight (tap the same colour again to remove it)
    * U              = underline
    * Note           = write a note on the selected words, or on the verse(s)
    * Clear          = remove highlight/underline from just the selected words
    * Copy           = copy the words or verses with the reference
    * X              = deselect
- A small pencil mark in the text shows a note. Tap it to read or edit the note.
- Menu (three lines) > "My notes, highlights & links" lists everything, with search and
  filters. Tap an item to jump to it.
- Everything is saved automatically in this browser on this computer/phone.

BACKUP (important)
- In "My notes & highlights" use "Export backup" now and then. It saves a small .json file.
- To move notes to another device, or to restore them: "Import backup" and choose the file.
  Importing never creates duplicates, and it carries deletions across too.
- Opening the app from a different folder, or in a different browser, starts with an
  empty notes list. Import your backup file to bring your notes back.

CONTENTS TREE
- Tap the menu button (three lines) or the chapter title to open it.
- Old Testament / New Testament > Law, History, Poetry & Wisdom, Prophets, Gospels,
  Epistles... > Book > Chapters > Verses.
- Tap a book to open its chapters. Tap a chapter to go there; the verse numbers of
  that chapter appear underneath. Tap a verse to jump to it.
- Type in "Filter books" to find a book quickly.
- On a wide screen (Mac) the tree stays open beside the text. On a phone it slides
  over the text; tap Close or outside it to put it away.

TEXT
- The text is the 1769 standard KJV (eBible.org edition), with:
  * Psalm titles ("A Psalm of David...") and the 22 Hebrew-letter headings of Psalm 119
  * words supplied by the translators shown in italics (Aa > "Supplied words in italics")
  * LORD / GOD printed in small capitals, as in printed Bibles
  * Psalms set out in poetry lines; prose in paragraphs
- Not included in this edition: chapter summary headings ("The Argument"), the
  subscriptions at the end of Paul's epistles, marginal notes, and the Apocrypha.
- Copy gives plain text (no italics marks).

SEARCH
- a reference:  John 3:16   1 cor 13   ps 119   matthew 5:3-12   jude
- words:        shepherd      (verses containing the word)
- several words: shepherd lord   (verses containing all of them)
- an exact phrase: "still small voice"   (use quote marks)
- a book's name as a word (e.g. Job): put it in quotes: "job"
- Hyphens are ignored, so "beersheba" finds "Beer-sheba".

OTHER
- Tap a verse to select it (tap more to select several), then press Copy.
- "Aa" changes text size, theme (light / sepia / dark), italics and layout.
- Arrow keys move between chapters; "/" opens search.

text-differences.csv (separate file) lists every verse whose wording differs from the
Project Gutenberg edition used in the first version of this app.
