import { startPlayer } from './startPlayer.js';

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const params = new URLSearchParams(window.location.search);
const levelName = params.get('level') || 'test-room';

function show(text, isError = false) {
  status.textContent = text;
  status.hidden = !text;
  status.dataset.error = isError ? 'true' : 'false';
}

show(`Loading ${levelName}…`);

startPlayer({ canvas, levelName })
  .then((runtime) => {
    show('Click to capture the mouse. WASD to move, Space to jump, Esc to release.');
    canvas.addEventListener('click', () => show(''), { once: true });
    window.addEventListener('resize', () => runtime.setSize(window.innerWidth, window.innerHeight));
    window.__bbPlayer = runtime; // Handle for debugging and browser acceptance checks.
  })
  .catch((err) => {
    console.error(err);
    show(`Could not start "${levelName}": ${err.message}`, true);
  });
