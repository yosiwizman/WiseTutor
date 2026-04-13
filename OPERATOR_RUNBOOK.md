# WiseTutor Operator Runbook

WiseTutor runs locally on the ai-desktop computer for private family use only.
Once started, open Chrome and go to **http://localhost:3782**.

---

## 1. Start the app

Open a terminal and run:

```
bash /home/ai-desktop/projects/WiseTutor/scripts_local/wt_start.sh
```

Wait until you see **OK** in the output (takes about 15–30 seconds).
Then open Chrome to http://localhost:3782.

---

## 2. Stop the app

```
bash /home/ai-desktop/projects/WiseTutor/scripts_local/wt_stop.sh
```

---

## 3. Is it working?

```
bash /home/ai-desktop/projects/WiseTutor/scripts_local/wt_health.sh
```

Every line should say **PASS**. If any line says **FAIL**, a short hint follows
it explaining what is wrong. Common fixes: make sure the app is started
(step 1), and make sure Ollama is running on the machine.

---

## 4. Where is the data?

- User accounts and sessions: `data/users/` and `data/user/` folders inside
  the WiseTutor project.
- User list file: `data/users.json`.
- Voice models: `/mnt/models/piper/` (on the large models drive).
- API keys and secrets: `.env` file in the WiseTutor project folder.

Do not move or delete these without backing up first (see section 6).

---

## 5. Check what is running

```
bash /home/ai-desktop/projects/WiseTutor/scripts_local/wt_status.sh
```

Shows which processes are running and which ports are in use.

---

## 6. Back it up

```
bash /home/ai-desktop/projects/WiseTutor/scripts_local/wt_backup.sh
```

Creates a timestamped file in the `backups/` folder inside the project.
The backup includes all user data and settings. Old backups older than
14 days are removed automatically.

---

## 7. Restore from a backup

First, list available backups:

```
ls /home/ai-desktop/projects/WiseTutor/backups/
```

Then restore by passing the filename:

```
bash /home/ai-desktop/projects/WiseTutor/scripts_local/wt_restore.sh backups/wt-backup-YYYYMMDD-HHMMSS.tar.gz
```

Your current live data is moved aside (not deleted) before the backup is
extracted, so nothing is permanently lost in this step.

---

## 8. Roll back an update that broke things

Only do this if the health check (section 3) fails after a software update.

You need the git commit ID of the last working version (Yosi can look this
up). Then run:

```
bash /home/ai-desktop/projects/WiseTutor/scripts_local/wt_rollback.sh <git-sha>
```

After rollback, start the app again (section 1) and run the health check
(section 3) to confirm it is working.

---

## 9. If all else fails

1. Stop the app (section 2).
2. Back it up (section 6).
3. Restore the last known-good backup (section 7).
4. Start the app again (section 1).
5. Run the health check (section 3).

---

Need help? Text Yosi.
