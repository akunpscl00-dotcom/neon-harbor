// Screenshot scenes behind ?shot=chase|foot|beach|title. Each sets up a real moment of the game,
// plays the actual systems forward with simple autopilot input, then renders one frame and sets
// window.__shotReady. Nothing here draws anything the game itself does not draw.
import { blockCenter, roadCenter } from './config.js';
import { Vehicle } from './vehicle.js';
import { steerToward } from './traffic.js';
import { simulateHold, getMouse, endFrame } from './input.js';
import { seed } from './random.js';
import { STORY } from './missions.js';

const STEP = 1 / 30;

function run(game, seconds, each) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i += 1) {
    if (each) each(i);
    game.step(STEP);
    endFrame();
  }
}

/** Hold the keys that steer the player's car toward a point in its lane. */
function autopilot(game, tx, tz, throttle = true) {
  const v = game.player.vehicle;
  const { steer } = steerToward(v, tx, tz);
  simulateHold('KeyW', throttle);
  simulateHold('KeyD', steer > 0.12);
  simulateHold('KeyA', steer < -0.12);
}

function setStage(game, index, stageType, text) {
  const m = game.missions;
  m.next = index;
  m.active = { index };
  m.stage = STORY[index].stages.findIndex((s) => s.type === stageType);
  game.hud.setObjective(STORY[index].title, text ?? STORY[index].stages[m.stage].text);
}

function finish(game) {
  game.render();
  window.__shotReady = true;
}

function startPlay(game, x, z, heading, clock) {
  game.newGame();
  game.missions.abort('');
  game.hud.big('', '');
  document.getElementById('hud-big').classList.remove('show');
  game.clock = clock;
  game.money = 18450;
  game.placePlayer(x, z, heading);
}

const scenes = {
  chase(game) {
    // Heatwave: three heat diamonds, Ferro's Sabre GT, cruisers on its tail down Sundial Avenue
    const x = roadCenter(4) - 4;
    const z = roadCenter(1) + 10;
    startPlay(game, x, z, 0, 17.4);
    run(game, 5, () => {});
    const car = new Vehicle(game.scene, 'sabre', '#f72585', x, z, 0);
    car.mission = true;
    game.player.enterVehicle(car);
    game.player.giveWeapon('pistol', 60);
    game.missions.car = car;
    setStage(game, 3, 'loseHeat');
    game.police.setLevel(3);
    car.vz = 24;
    const offsets = [[0, -13], [3.6, -22], [-3.2, -31]];
    for (const [ox, oz] of offsets) {
      const cop = new Vehicle(game.scene, 'cruiser', null, x + ox, z + oz, 0);
      cop.driver = 'cop';
      cop.siren = true;
      cop.crew = 2;
      cop.stuck = 0;
      cop.vz = 24;
      game.police.cruisers.push(cop);
    }
    game.rig.snapBehind(0);
    game.rig.pitch = 0.16;
    // coast at pursuit speed so the cruisers close in instead of falling behind
    run(game, 2.4, () => autopilot(game, x, game.player.z + 40, false));
    // swing the chase camera round to the front-left so the Sabre and the cruisers on its tail share the frame
    game.rig.yaw = Math.PI - 0.38;
    game.rig.pitch = 0.24;
    game.rig.idle = 0;
    run(game, 0.6, () => autopilot(game, x, game.player.z + 40, false));
    finish(game);
  },

  foot(game) {
    // Tide Breakers: Nico with the Rattler SMG against the Tidecutters in the Old Port yard
    const yardX = blockCenter(1) + 14;
    const yardZ = blockCenter(6);
    startPlay(game, yardX - 6, yardZ - 34, 0, 17.6);
    game.player.giveWeapon('smg', 180);
    game.player.selectWeapon('smg');
    game.player.armor = 70;
    run(game, 5);
    setStage(game, 2, 'goto');
    game.missions.stage -= 0;
    game.missions.advance();
    run(game, 1.2);
    const mouse = getMouse();
    const target = game.missions.enemies[0];
    const aimAt = () => {
      const p = game.player.body;
      game.rig.yaw = Math.atan2(target.x - p.x, target.z - p.z) - 0.04;
      game.rig.pitch = 0.08;
    };
    run(game, 1.0, () => { aimAt(); mouse.right = true; });
    run(game, 0.55, () => { aimAt(); mouse.right = true; mouse.left = true; });
    finish(game);
  },

  beach(game) {
    // Paper Route against the clock, cruising the beachfront in a Vela Coupe at sunset
    const z = roadCenter(9) + 4;
    const x = roadCenter(2) + 12;
    startPlay(game, x, z, Math.PI / 2, 18.7);
    run(game, 6);
    const car = new Vehicle(game.scene, 'vela', '#ffd166', x, z, Math.PI / 2);
    game.player.enterVehicle(car);
    car.vx = 20;
    setStage(game, 1, 'goto');
    game.missions.stage = 1;
    game.missions.advance();
    game.missions.timer = 83;
    game.rig.snapBehind(Math.PI / 2);
    run(game, 3.5, () => autopilot(game, game.player.x + 40, z));
    game.rig.yaw = Math.PI / 2 + 0.75;
    game.rig.pitch = 0.12;
    game.rig.idle = 0;
    run(game, 0.3, () => autopilot(game, game.player.x + 40, z));
    game.hud.district('Coral Flats');
    run(game, 0.1, () => autopilot(game, game.player.x + 40, z));
    finish(game);
  },

  title(game) {
    game.menu.showTitle();
    run(game, 8);
    finish(game);
  },
};

export function stageShot(game, name) {
  seed(20261124);
  (scenes[name] ?? scenes.title)(game);
}
