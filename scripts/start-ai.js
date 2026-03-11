/**
 * Start the ai-service (Python FastAPI). Uses venv if present.
 * On Windows without venv, tries "py -3" (Python launcher) then "python".
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const aiDir = path.join(root, 'ai-service');
const isWin = process.platform === 'win32';
const venvPython = isWin
  ? path.join(aiDir, 'venv', 'Scripts', 'python.exe')
  : path.join(aiDir, 'venv', 'bin', 'python');

let pythonCmd = null;
let args = ['-m', 'uvicorn', 'app.main:app', '--reload', '--port', '8001'];
let useShell = false;

if (fs.existsSync(venvPython)) {
  pythonCmd = venvPython;
} else if (process.env.PYTHON) {
  pythonCmd = process.env.PYTHON;
  useShell = isWin;
} else if (isWin) {
  // Windows: prefer Python launcher (py -3) so we don't get "command not found"
  pythonCmd = 'py';
  args = ['-3', '-m', 'uvicorn', 'app.main:app', '--reload', '--port', '8001'];
  useShell = true;
} else {
  pythonCmd = 'python3';
  useShell = false;
}

const child = spawn(pythonCmd, args, {
  cwd: aiDir,
  stdio: 'inherit',
  shell: useShell,
});
child.on('error', (err) => {
  console.error('Failed to start ai-service:', err.message);
  if (err.code === 'ENOENT' || String(err.message).includes('spawn')) {
    console.error('\nTip: Create a venv and install dependencies first:');
    console.error('  cd ai-service');
    console.error('  python -m venv venv');
    console.error('  venv\\Scripts\\activate   (Windows)  or  source venv/bin/activate   (Linux/macOS)');
    console.error('  pip install -r requirements.txt');
  }
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (code === 127) {
    console.error('\nAI service: Python/uvicorn not found (exit 127).');
    console.error('Create the venv: cd ai-service && python -m venv venv');
    console.error('Then: venv\\Scripts\\pip install -r requirements.txt   (Windows)');
  }
  process.exit(code ?? (signal ? 1 : 0));
});
