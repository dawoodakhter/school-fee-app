// Saving backup files: one file per backup, an optional second copy, and tidying up old ones.
const fs = require('fs');
const path = require('path');

const FILE_PATTERN = /^school-fee-backup-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.json$/;

function backupFileName(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `school-fee-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}.json`;
}

// Writes the backup into `folder`.
//  - copyDir (optional): also copies the file there, for example a Google Drive or USB folder.
//    If that folder is not there, the backup is still saved and you get a warning.
//  - keep: how many backups to keep in `folder`. Older backup files are deleted. Other files are never touched.
function saveBackupFile(backup, folder, { keep = 60, copyDir = '', date = new Date() } = {}) {
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, backupFileName(date));
  fs.writeFileSync(file, JSON.stringify(backup, null, 2));

  let copiedTo = null;
  let copyProblem = null;
  if (copyDir) {
    try {
      if (!fs.existsSync(copyDir)) throw new Error('that folder does not exist');
      const target = path.join(copyDir, path.basename(file));
      fs.copyFileSync(file, target);
      copiedTo = target;
    } catch (err) {
      copyProblem = err.message;
    }
  }

  const ours = fs.readdirSync(folder).filter((name) => FILE_PATTERN.test(name)).sort();
  const remove = ours.slice(0, Math.max(0, ours.length - Math.max(1, keep)));
  for (const name of remove) fs.unlinkSync(path.join(folder, name));

  return { file, copiedTo, copyProblem, pruned: remove.length };
}

module.exports = { saveBackupFile, backupFileName, FILE_PATTERN };