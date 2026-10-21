// Mantou (馒头, "steamed bun"), the resort's Old English Sheepdog, who lives up
// at the top of the mountain for now. Everything it does is decided here and
// posed in code (body.js, rig.js); there are no animation clips.
//
// On its own it potters about its spot: looks around, sniffs the snow, shakes
// it off its coat, and when nobody comes by for a while it sits, lies down and
// curls up asleep. When someone comes near it wakes and watches them, then
// trots over, tail going, to say hello with a play bow, a bounce or a bark.
// Afterwards it keeps them company: sits by them while they stand, follows
// them about, and chases after them when they ride off until it gives up and
// trots home. Petted (E), it sits and leans into the hand, and if you keep at
// it, rolls over for a belly rub. Throw a snowball (Q) and it bounds after it,
// leaping to catch one still in the air, or pouncing where it landed and
// digging for it, then looking up puzzled when it's gone. If you take a fall
// nearby it runs over to check on you.
//
// The world frame: Dog.root stands on the snow under the dog, turned to its
// heading (+z forward), and holds the model at its size.
import * as THREE from 'three';
import { loadDog, DogRig } from './rig.js';
import { DogBody } from './body.js';
import { Spray } from '../player/fx.js';
import { makeToon } from '../render/toon.js';

export const DOG = { en: 'Mantou', zh: '馒头' };
const SIZE = 1.3; // metres per model unit: 0.6 m at the shoulder, 1.3 m nose to tail
// m/s: a stroll, a trot, a gallop and flat out (an Old English Sheepdog isn't fast).
const SPEED = { walk: 1.0, trot: 2.6, run: 6.5, sprint: 9.5 };
const LEASH = 170; // m from home it'll chase someone before it gives up
const NOTICE = 32; // m it notices someone from (awake)
const WAKE = 10; // m someone wakes it from, curled up asleep
const PET = 2.4; // m from the dog you can pet it
const G = 9.81;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
const { clamp, randFloat: rand, euclideanModulo: mod } = THREE.MathUtils;
const angleTo = (from, to) => mod(to - from + Math.PI, Math.PI * 2) - Math.PI;
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export class Dog {
  // `home`: { x, z, yaw } where it lives. `obstacles`: rotated boxes it walks
  // round (the game's footprints, a live list); it goes round trees too.
  constructor({ hf, forest, obstacles = [], home }) {
    this.hf = hf;
    this.forest = forest;
    this.obstacles = obstacles;
    this.home = home;
    this.root = new THREE.Group();
    this.root.name = 'Dog';
    this.pos = new THREE.Vector3(home.x, hf.heightAt(home.x, home.z), home.z);
    this.yaw = home.yaw;
    this.speed = 0;
    this.turnRate = 0;
    this.goal = null; // { x, z, speed, stop, face }
    this.state = 'home';
    this.t = 0; // s in this state
    this.next = 2; // s to its next idle whim
    this.lookAt = null; // a world point to look at, or null to look where it's going
    this.glance = 0; // looking about: an offset from straight ahead (radians)
    this.puff = 0; // out of breath, 0–1
    this.pets = 0; // pets in a row
    this.lastPet = -1e9;
    this.events = []; // { type: 'bark' | 'whine' | 'pop' | 'thud' | 'swish' | 'hello', at } for the game to sound or show
    this.spray = new Spray(160); // snow off its coat and out of its digging
    this.spray.points.material.size = 0.18;
    this.ball = new Snowball(hf);
    this.ready = loadDog().then((gltf) => {
      this.rig = new DogRig(gltf);
      this.body = new DogBody(this.rig);
      this.body.scale = SIZE;
      this.rig.scene.scale.setScalar(SIZE);
      this.root.add(this.rig.scene);
      this.#place();
      return this;
    });
  }

  // What's going on around it, each frame. `who`: the person, or null when
  // there's nobody about (riding a lift, in a vehicle, in the pool):
  //   { pos, vel, head, facing, crashed } (world; `facing` is the way their
  //   chest faces, `head` where to look them in the eye).
  update(dt, time, who, camera) {
    this.time = time;
    this.ball.update(dt, this.spray, this.events);
    if (!this.body) return;
    this.#think(dt, who);
    this.#move(dt);
    this.#place();
    // Far off it isn't posed (nobody would see it), only kept moving.
    const far = camera && camera.position.distanceTo(this.pos) > 350;
    this.root.visible = !far;
    if (!far) {
      this.#aimHead(who);
      this.body.speed = this.speed / SIZE;
      this.body.turnRate = this.turnRate;
      const c = Math.cos(this.yaw), s = Math.sin(this.yaw), y0 = this.pos.y;
      this.body.update(dt, (mx, mz) => (this.hf.heightAt(this.pos.x + (mx * c + mz * s) * SIZE, this.pos.z + (-mx * s + mz * c) * SIZE) - y0) / SIZE);
      this.#snow(dt);
    }
    this.spray.update(dt);
  }

  // ---- What it's up to ----
  #to(state) {
    if (this.state === state) return;
    this.state = state;
    this.t = 0;
    this.sub = 0;
    this.next = 0;
  }

  #think(dt, who) {
    const b = this.body;
    this.t += dt;
    this.next -= dt;
    const d = who ? Math.hypot(who.pos.x - this.pos.x, who.pos.z - this.pos.z) : Infinity;
    const fromHome = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
    const sp = who ? Math.hypot(who.vel.x, who.vel.z) : 0;
    // Out of breath after a run: it pants until it gets it back (being petted
    // or rolling over sets it panting too).
    this.puff = clamp(this.puff + (this.speed > 4 ? dt * 0.12 : -dt * 0.05), 0, 1);
    b.pant = clamp(this.puff * 1.6, 0, 1);

    // Someone falling nearby: it runs to see if they're all right.
    if (who?.crashed && d < 30 && !this.ball.flying && !['check', 'petted', 'belly'].includes(this.state)) {
      if (this.state !== 'rest' || d < WAKE * 1.5) this.#to('check');
    }
    // Nobody about any more: home.
    if (!who && ['watch', 'greet', 'hello', 'attend', 'follow', 'chase', 'check', 'petted', 'belly'].includes(this.state)) this.#to('return');

    switch (this.state) {
      case 'home': {
        // Pottering about its spot.
        this.goal = this.wander ?? null;
        if (this.wander && this.#near(this.wander, 0.5)) this.wander = null;
        b.posture = this.idleSit ? 'sit' : 'stand';
        b.wag = 0.25;
        b.tailUp = 0;
        b.sniff = this.wander ? 0.8 : 0;
        b.tilt = 0;
        b.lean = 0;
        b.dig = 0;
        this.lookAt = null;
        if (this.next <= 0) this.#whim();
        if (who && d < NOTICE) this.#to(d < 18 && sp < 5 ? 'greet' : 'watch');
        else if (this.t > rand(14, 20) && !this.wander) this.#to('rest');
        if (fromHome > 8 && !this.wander) this.#to('return');
        break;
      }
      case 'rest': {
        // Sit, then lie down, then curl up asleep, yawning on the way.
        this.goal = null;
        b.sniff = b.dig = b.lean = 0;
        b.tilt = 0;
        const stage = this.t < 7 ? 'sit' : this.t < 20 ? 'lie' : 'sleep';
        if (b.posture !== stage) {
          b.posture = stage;
          if (stage !== 'sit') b.play('yawn');
        }
        b.tired = b.posture === 'sleep' ? 1 : this.t / 25;
        b.wag = b.posture === 'sleep' ? 0 : 0.1;
        b.tailUp = -0.1;
        this.lookAt = null;
        if (b.posture === 'lie' && this.next <= 0) { this.glance = rand(-1, 1); this.next = rand(3, 7); }
        if (who) {
          const wake = b.posture === 'sleep' ? WAKE : NOTICE * 0.6;
          if (d < wake) {
            // Head up first, a look, then up on its feet.
            if (b.posture === 'sleep') { b.posture = 'lie'; this.t = 8; }
            this.lookAt = who.head;
            b.tired = 0;
            this.wakeT = (this.wakeT ?? 0) + dt;
            if (this.wakeT > 1.2) { b.play('shake'); this.#to(sp < 5 ? 'greet' : 'watch'); }
          } else this.wakeT = 0;
        }
        if (this.state !== 'rest') { b.tired = 0; this.wakeT = 0; }
        break;
      }
      case 'watch': {
        // Up and looking, tail going: who's this?
        this.goal = null;
        b.posture = 'stand';
        b.wag = 0.6;
        b.tailUp = 0.4;
        b.sniff = 0;
        this.lookAt = who.head;
        this.#face(who.pos);
        if (d < 18 && sp < 5) this.#to('greet');
        else if (d > NOTICE * 1.3) this.#to('return');
        else if (sp > 5 && d < 25) this.#to('chase');
        break;
      }
      case 'greet': {
        // Over to them, at a trot or a run.
        b.posture = 'stand';
        b.wag = 1.1;
        b.tailUp = 0.6;
        b.sniff = 0;
        this.lookAt = who.head;
        this.goal = this.#beside(who, 1.5, d > 10 ? SPEED.run : SPEED.trot);
        if (this.#near(this.goal, 0.6) || d < 1.9) this.#to('hello');
        if (sp > 6) this.#to('chase');
        if (d > NOTICE * 1.4 || fromHome > LEASH) this.#to('return');
        break;
      }
      case 'hello': {
        // Hello! A play bow, a bounce or a bark, the whole back end wagging.
        this.goal = null;
        this.#face(who.pos);
        this.lookAt = who.head;
        b.wag = 1.4;
        b.tailUp = 0.8;
        if (this.sub === 0) {
          this.events.push({ type: 'hello', at: this.pos.clone() });
          this.sub = pick(['bow', 'bounce', 'bark', 'sniff']);
          if (this.sub === 'bow') { b.posture = 'bow'; this.#bark(); }
          if (this.sub === 'bounce') { b.posture = 'rear'; this.#bark(); }
          if (this.sub === 'bark') { this.#bark(); this.barkAgain = 0.45; }
          if (this.sub === 'sniff') { b.sniff = 0.6; }
        }
        if (this.barkAgain !== undefined && (this.barkAgain -= dt) <= 0) { this.#bark(); this.barkAgain = undefined; }
        if (this.sub === 'bounce' && this.t > 0.7) b.posture = 'stand';
        if (this.sub === 'bounce' && this.t > 1.0 && this.t < 1.1) b.posture = 'rear';
        if (this.sub === 'bounce' && this.t > 1.6) b.posture = 'stand';
        if (this.sub === 'bow' && this.t > 1.6) b.posture = 'stand';
        if (this.t > 1.2) b.sniff = 0;
        if (this.t > 2.6) this.#to('attend');
        break;
      }
      case 'attend': {
        // Keeping them company: standing by them, then sitting, looking up at
        // them, tail sweeping; a cocked head or a bark now and then.
        this.lookAt = who.head;
        b.wag = 0.7;
        b.tailUp = 0.3;
        b.sniff = 0;
        b.lean = 0;
        if (d > 3.6 || sp > 1.5) { this.#to(sp > 6 ? 'chase' : 'follow'); break; }
        if (d < 1.0) this.goal = this.#away(who, 1.3);
        else { this.goal = null; this.#face(who.pos); }
        b.posture = this.t > 2.5 && this.speed < 0.3 ? 'sit' : 'stand';
        if (this.next <= 0) {
          this.next = rand(3, 7);
          const w = Math.random();
          if (w < 0.35) { b.tilt = pick([-0.35, 0.35]); this.untilt = 1.2; }
          else if (w < 0.5 && this.t > 8) this.#bark();
          else if (w < 0.6) b.play('yawn');
        }
        if (this.untilt !== undefined && (this.untilt -= dt) <= 0) { b.tilt = 0; this.untilt = undefined; }
        if (this.t > 40) this.#to('rest');
        break;
      }
      case 'follow': {
        // Tagging along beside them, matching their pace.
        b.posture = 'stand';
        b.wag = 0.8;
        b.tailUp = 0.5;
        b.tilt = 0;
        this.lookAt = d < 6 && this.speed < 3 ? who.head : null;
        const want = clamp(sp + Math.max(0, d - 2.5) * 1.2, 0, SPEED.sprint);
        this.goal = this.#beside(who, 1.8, want);
        if (sp > 6.5 && d > 4) this.#to('chase');
        else if (sp < 0.6 && d < 3) this.#to('attend');
        if (fromHome > LEASH) this.#to('giveup');
        break;
      }
      case 'chase': {
        // After them flat out, barking, until they're too far or too far from home.
        b.posture = 'stand';
        b.wag = 0.9;
        b.tailUp = 0.6;
        b.tilt = 0;
        this.lookAt = null;
        this.goal = this.#beside(who, 2.2, SPEED.sprint);
        if (this.next <= 0) { this.#bark(); this.next = rand(1.2, 2.8); }
        if (sp < 4 && d < 8) this.#to('follow');
        if (fromHome > LEASH || (d > 45 && sp > SPEED.sprint) || (d > 90)) this.#to('giveup');
        break;
      }
      case 'giveup': {
        // Pulls up, barks after them, then turns for home.
        this.goal = null;
        b.wag = 0.4;
        b.tailUp = 0.1;
        if (who) { this.lookAt = who.head; this.#face(who.pos); }
        if (this.sub === 0) { this.sub = 1; this.#bark(); this.barkAgain = 0.5; }
        if (this.barkAgain !== undefined && (this.barkAgain -= dt) <= 0) { this.#bark(); this.barkAgain = undefined; }
        if (this.t > 2.2) this.#to('return');
        break;
      }
      case 'return': {
        // Home at a trot, walking the last of it.
        b.posture = 'stand';
        b.wag = 0.3;
        b.tailUp = 0;
        b.sniff = b.lean = b.dig = 0;
        b.tilt = 0;
        this.lookAt = null;
        this.goal = { x: this.home.x, z: this.home.z, speed: fromHome > 12 ? SPEED.trot : SPEED.walk, stop: 0.4, face: this.home.yaw };
        if (fromHome < 0.8 && Math.abs(angleTo(this.yaw, this.home.yaw)) < 0.3) { this.#to('home'); this.next = 2; }
        // Someone coming to see it on the way.
        if (who && d < 12 && sp < 3 && this.t > 3) this.#to('greet');
        break;
      }
      case 'petted': {
        // Sat by them, leaning up into the hand, tail sweeping the snow.
        this.goal = this.#inFront(who, 0.8, SPEED.trot);
        if (this.#near(this.goal, 0.2)) { this.goal = null; this.#face(who.pos); }
        b.posture = this.goal ? 'stand' : 'sit';
        b.wag = 1.0;
        b.tailUp = 0.2;
        b.lean = this.goal ? 0 : 1;
        b.tilt = 0;
        b.sniff = 0;
        this.lookAt = who.head;
        b.pant = Math.max(b.pant, 0.7);
        if (this.time - this.lastPet > 3.5) { this.pets = 0; this.#to('attend'); }
        break;
      }
      case 'belly': {
        // Belly up for a rub, squirming.
        this.goal = null;
        b.posture = 'belly';
        b.wiggle = 1;
        b.wag = 1.2;
        b.lean = 0;
        b.pant = 1;
        this.lookAt = who.head;
        if (this.t > 4.5 || this.time - this.lastPet > 3) {
          b.wiggle = 0;
          b.posture = 'stand';
          b.play('shake');
          this.pets = 0;
          this.#to('attend');
        }
        break;
      }
      case 'fetch': {
        // After the snowball, off at the wind-up: under it if it's still up,
        // else where it came down.
        const ball = this.ball, up = ball.flying || ball.waiting > 0;
        b.posture = 'stand';
        b.wag = 1.1;
        b.tailUp = 0.8;
        b.sniff = b.lean = 0;
        b.tilt = 0;
        this.lookAt = ball.flying ? ball.pos : null;
        const spot = up ? ball.landing : ball.pos;
        // Now and then it's slow off the mark, gets there late and has to dig.
        this.goal = { x: spot.x, z: spot.z, speed: this.slow ? SPEED.run : SPEED.sprint, stop: up ? 0.2 : 0.45 };
        if (ball.flying && !this.slow) {
          // Coming down to where its jaws can reach at the top of a leap, soon
          // enough: up it goes to snap it out of the air.
          const mouth = 0.95, fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
          const y = ball.pos.y - this.pos.y - mouth, vy = ball.vel.y, disc = vy * vy + 2 * G * y;
          if (disc > 0 && !this.catchAt) {
            const t = (vy + Math.sqrt(disc)) / G; // s until it's down to jaw height
            const hx = ball.pos.x + ball.vel.x * t - (this.pos.x + fx * 0.5 + fx * this.speed * t);
            const hz = ball.pos.z + ball.vel.z * t - (this.pos.z + fz * 0.5 + fz * this.speed * t);
            if (t < 0.38 && Math.hypot(hx, hz) < 1.1) {
              b.play('leap', { height: 0.42, dur: 0.75 });
              this.catchAt = this.time + t;
            }
          }
          if (this.catchAt && this.time >= this.catchAt) {
            this.catchAt = 0;
            _v.set(this.pos.x + fx * 0.5, this.pos.y + mouth, this.pos.z + fz * 0.5);
            if (ball.pos.distanceTo(_v) < 1.4) {
              ball.pop(this.spray, this.events);
              b.play('bark', { dur: 0.25 });
              this.#to('proud');
            }
          }
        } else if (ball.down && this.#near(ball.pos, 0.75)) {
          // The pounce: it lands on it, and the snowball breaks up into the snow.
          b.play('leap', { height: 0.18, dur: 0.5 });
          this.digAt = ball.pos.clone();
          this.breakAt = this.time + 0.35;
          this.#to('dig');
        } else if (!up && !ball.down) this.#to('puzzled');
        break;
      }
      case 'dig': {
        // Digging where it came down: snow flying out behind.
        this.goal = null;
        this.#face(this.digAt);
        if (this.breakAt && this.time >= this.breakAt) { this.breakAt = 0; this.ball.pop(this.spray, this.events); }
        b.dig = this.t > 0.5 ? 1 : 0;
        b.sniff = 0.4;
        b.wag = 0.9;
        b.tailUp = 0.9;
        this.lookAt = null;
        if (this.t > 2.6) { b.dig = 0; b.play('sneeze'); this.#to('puzzled'); }
        break;
      }
      case 'puzzled': {
        // Where did it go? Head cocked one way, then the other.
        this.goal = null;
        b.dig = b.sniff = 0;
        b.wag = 0.3;
        b.tailUp = 0.2;
        b.tilt = this.t < 0.9 ? 0.4 : this.t < 1.8 ? -0.4 : 0;
        this.lookAt = this.t < 1.8 ? this.digAt ?? this.ball.last : who?.head ?? null;
        if (this.t > 2.4) { b.tilt = 0; this.#to(who ? 'proud' : 'return'); }
        break;
      }
      case 'proud': {
        // Back to them, pleased with itself.
        b.posture = 'stand';
        b.wag = 1.2;
        b.tailUp = 0.7;
        b.tilt = 0;
        this.lookAt = who?.head ?? null;
        if (!who) { this.#to('return'); break; }
        this.goal = this.#beside(who, 1.4, d > 8 ? SPEED.run : SPEED.trot);
        if (this.#near(this.goal, 0.6) || d < 1.8) { this.#bark(); this.#to('attend'); }
        break;
      }
      case 'check': {
        // Are you all right? Over to them, a sniff and a lick, a little whine.
        b.posture = 'stand';
        b.wag = 0.45;
        b.tailUp = -0.1;
        b.tilt = 0;
        this.lookAt = who.head;
        this.goal = this.#beside(who, 1.0, d > 6 ? SPEED.run : SPEED.trot);
        if (this.#near(this.goal, 0.5) || d < 1.3) {
          this.goal = null;
          this.#face(who.pos);
          b.sniff = 0.3;
          b.pant = 1;
          if (!this.whined) { this.whined = true; this.events.push({ type: 'whine', at: this.pos.clone() }); }
          this.checked = (this.checked ?? 0) + dt;
          if (this.checked > 2.2 && !who.crashed) { this.checked = 0; this.whined = false; b.sniff = 0; this.#to('attend'); }
        }
        break;
      }
    }
  }

  // An idle whim at home: a look round, a sniff about, a shake, a sit.
  #whim() {
    const b = this.body;
    this.next = rand(3, 7);
    const w = Math.random();
    this.idleSit = false;
    if (w < 0.3) this.glance = rand(-1.2, 1.2);
    else if (w < 0.55) {
      const a = Math.random() * Math.PI * 2, r = rand(1.5, 5);
      const x = this.home.x + Math.cos(a) * r, z = this.home.z + Math.sin(a) * r;
      if (this.#clear(x, z, 0.5)) this.wander = { x, z, speed: SPEED.walk, stop: 0.3 };
    } else if (w < 0.68) b.play('shake');
    else if (w < 0.85) { this.idleSit = true; this.next = rand(5, 9); }
    else { this.glance = 0; b.play('yawn'); }
  }

  #bark() {
    this.body.play('bark');
    this.events.push({ type: 'bark', at: this.pos.clone() });
  }

  // ---- What the game asks of it ----
  // Whether someone at `pos` is close enough to pet it.
  canPet(pos) {
    return !!this.body && Math.hypot(pos.x - this.pos.x, pos.z - this.pos.z) < PET
      && !['fetch', 'dig', 'chase', 'check'].includes(this.state);
  }
  // Petted by `who`: it sits and leans in; the third pet in a row rolls it over.
  pet(who) {
    if (!this.body) return;
    this.lastPet = this.time;
    this.pets++;
    this.body.wiggle = 0;
    if (this.state === 'rest') this.body.play('shake');
    if (this.pets >= 3 && this.state !== 'belly') this.#to('belly');
    else if (this.state !== 'belly') this.#to('petted');
  }
  // Whether it'd chase a snowball thrown from `pos` (awake enough, near enough).
  canFetch(pos) {
    return !!this.body && !this.ball.busy && Math.hypot(pos.x - this.pos.x, pos.z - this.pos.z) < 40
      && !(this.state === 'rest' && this.body.posture === 'sleep') && this.state !== 'belly';
  }
  // A snowball lobbed from `from` toward `dir` (world, horizontal), let go
  // `delay` s from now, after the wind-up the dog sets off at.
  throwBall(from, dir, delay = 0) {
    const fetch = this.canFetch(from);
    this.ball.aim(from, dir, delay);
    this.slow = Math.random() < 0.35;
    if (fetch) {
      this.body.posture = 'stand';
      this.body.wiggle = 0;
      this.#to('fetch');
    }
  }

  // ---- Getting about ----
  // A spot `gap` m from `who`, on the side the dog is on, a little behind them
  // if they're moving.
  #beside(who, gap, speed) {
    _v.set(this.pos.x - who.pos.x, 0, this.pos.z - who.pos.z);
    if (_v.lengthSq() < 1e-4) _v.set(1, 0, 0);
    _v.normalize();
    const sp = Math.hypot(who.vel.x, who.vel.z);
    if (sp > 0.5) {
      // Off to the side of their way, a little back.
      _w.set(who.vel.x, 0, who.vel.z).normalize();
      const side = Math.sign(_v.x * _w.z - _v.z * _w.x) || 1;
      _v.set(_w.z * side, 0, -_w.x * side).addScaledVector(_w, -0.35).normalize();
    }
    return { x: who.pos.x + _v.x * gap, z: who.pos.z + _v.z * gap, speed, stop: 0.3, lead: sp > 0.5 ? who.vel : null };
  }
  // A spot `gap` m in front of them (the way their chest faces), facing them.
  #inFront(who, gap, speed) {
    return { x: who.pos.x + who.facing.x * gap, z: who.pos.z + who.facing.z * gap, speed, stop: 0.15, face: Math.atan2(-who.facing.x, -who.facing.z) };
  }
  // Out from under their feet.
  #away(who, gap) {
    _v.set(this.pos.x - who.pos.x, 0, this.pos.z - who.pos.z).normalize();
    return { x: who.pos.x + _v.x * gap, z: who.pos.z + _v.z * gap, speed: SPEED.walk, stop: 0.1 };
  }
  #near(p, r) {
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < r;
  }
  // Turns to face a point when standing still.
  #face(p) {
    this.faceYaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
  }

  // Steers for its goal: turns toward it (on the spot if it's well round),
  // speeds up and slows to stop at it, and goes round trees, buildings and the
  // map's edge.
  #move(dt) {
    const g = this.goal;
    let wantSpeed = 0, wantYaw = this.yaw;
    if (g) {
      // A moving target: aim where they'll be.
      let gx = g.x, gz = g.z;
      if (g.lead) { gx += g.lead.x * 0.4; gz += g.lead.z * 0.4; }
      const dx = gx - this.pos.x, dz = gz - this.pos.z, dist = Math.hypot(dx, dz);
      if (dist > g.stop) {
        wantYaw = Math.atan2(dx, dz);
        wantSpeed = Math.min(g.speed, Math.sqrt(2 * 5 * Math.max(0, dist - g.stop)) + (g.lead ? Math.hypot(g.lead.x, g.lead.z) : 0));
        wantYaw = this.#steer(wantYaw, Math.max(1.2, this.speed * 0.6));
      } else if (g.face !== undefined) wantYaw = g.face;
      else if (this.faceYaw !== undefined) wantYaw = this.faceYaw;
    } else if (this.faceYaw !== undefined) wantYaw = this.faceYaw;
    this.faceYaw = undefined;
    // Turn: on the spot when it's well round, wider at speed.
    const err = angleTo(this.yaw, wantYaw);
    const maxTurn = this.speed < 1 ? 3.2 : clamp(9 / Math.max(1, this.speed), 1.4, 3.2);
    const turn = clamp(err * 5, -maxTurn, maxTurn) * dt;
    this.yaw += turn;
    this.turnRate += (turn / Math.max(dt, 1e-4) - this.turnRate) * (1 - Math.exp(-dt * 10));
    if (Math.abs(err) > 1.4) wantSpeed = Math.min(wantSpeed, 0.6);
    const a = wantSpeed > this.speed ? (wantSpeed > SPEED.run ? 8 : 5.5) : 9; // off the mark hardest after something
    this.speed += clamp(wantSpeed - this.speed, -a * dt, a * dt);
    if (this.speed > 0.01) {
      const nx = this.pos.x + Math.sin(this.yaw) * this.speed * dt, nz = this.pos.z + Math.cos(this.yaw) * this.speed * dt;
      if (this.#clear(nx, nz, 0.35)) { this.pos.x = nx; this.pos.z = nz; }
      else this.speed *= 0.5;
    }
    this.pos.y = this.hf.heightAt(this.pos.x, this.pos.z);
  }

  // The heading nearest `yaw` that's clear `look` m ahead.
  #steer(yaw, look) {
    for (const off of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6]) {
      const a = yaw + off;
      if (this.#clear(this.pos.x + Math.sin(a) * look, this.pos.z + Math.cos(a) * look, 0.5)) return a;
    }
    return yaw;
  }

  #clear(x, z, r) {
    const hf = this.hf;
    if (!hf.inside(x, z, 40) || hf.holeAt(x, z)) return false;
    if (this.forest.hit(x, z, r)) return false;
    return this.obstacles.every((o) => boxGap(o, x, z) > r);
  }

  #place() {
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.yaw, 0);
  }

  // The head toward what it's watching, or ahead (and about, idling).
  #aimHead(who) {
    const b = this.body;
    const target = this.lookAt;
    if (target) {
      this.root.updateMatrixWorld(true);
      const head = this.rig.scene.localToWorld(this.rig.at('head', _w));
      _v.subVectors(target, head);
      _v.applyAxisAngle(_u.set(0, 1, 0), -this.yaw);
      // Out of reach of its neck: as far round as it goes.
      const yaw = clamp(Math.atan2(_v.x, _v.z), -1.4, 1.4);
      const pitch = clamp(Math.atan2(_v.y, Math.hypot(_v.x, _v.z)), -0.9, 0.9);
      b.lookAt.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      b.lookRate = 7;
    } else {
      // Ahead and a little down, into a turn, or glancing about.
      const yaw = clamp(this.turnRate * 0.25, -0.6, 0.6) + (this.speed < 0.3 ? this.glance : 0);
      b.lookAt.set(Math.sin(yaw), -0.12, Math.cos(yaw)).normalize();
      b.lookRate = 3;
      if (this.speed > 0.3) this.glance *= 0.95;
    }
  }

  // Snow: shaken off its coat, and kicked out behind it digging or running.
  #snow(dt) {
    const b = this.body;
    if (b.playing('shake')) {
      const n = Math.floor(dt * 70 + Math.random());
      _v.set(this.pos.x, this.pos.y + 0.5, this.pos.z);
      _w.set(0, 0.6, 0);
      if (n > 0) this.spray.emit(_v, _w, n, 2.6);
    }
    if (b.eased.dig > 0.5) {
      const n = Math.floor(dt * 45 + Math.random());
      _v.set(this.pos.x + Math.sin(this.yaw) * 0.4, this.pos.y, this.pos.z + Math.cos(this.yaw) * 0.4);
      _w.set(-Math.sin(this.yaw) * 3, 1.6, -Math.cos(this.yaw) * 3);
      if (n > 0) this.spray.emit(_v, _w, n, 1.2);
    }
    if (this.speed > 5) {
      const n = Math.floor(dt * this.speed * 1.5 + Math.random() * 0.6);
      _v.set(this.pos.x - Math.sin(this.yaw) * 0.5, this.pos.y, this.pos.z - Math.cos(this.yaw) * 0.5);
      _w.set(-Math.sin(this.yaw) * 1.5, 0.5, -Math.cos(this.yaw) * 1.5);
      if (n > 0) this.spray.emit(_v, _w, n, 0.8);
    }
  }

  // The top of its head (world), for a hand to pet.
  headTop(out = new THREE.Vector3()) {
    if (!this.rig) return out.copy(this.pos).setY(this.pos.y + 0.7);
    this.root.updateMatrixWorld(true);
    return this.rig.scene.localToWorld(this.rig.at('head', out)).add(_v.set(0, 0.12, 0));
  }

  // Its rotated box, for anything that wants to keep out of its way.
  get footprint() {
    return { x: this.pos.x, z: this.pos.z, yaw: this.yaw, hw: 0.25, hd: 0.6 };
  }
}

// A snowball thrown for the dog: an arc to the snow, where it lands as a lump
// for a while (unless the dog catches it first, when it bursts).
class Snowball {
  constructor(hf) {
    this.hf = hf;
    this.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 1), makeToon({ color: '#ffffff' }, { rim: 1, hatch: 0 }));
    this.mesh.castShadow = true;
    this.mesh.visible = false;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.landing = new THREE.Vector3();
    this.last = new THREE.Vector3(); // where it was last seen
    this.flying = false;
    this.down = false;
    this.waiting = 0; // s until it's let go
    this.left = 0; // s the lump lasts on the snow
    this.from = new THREE.Vector3();
    this.toss = new THREE.Vector3();
  }
  // In hand, in the air or on the snow.
  get busy() {
    return this.flying || this.waiting > 0;
  }
  // Thrown high enough to hang in the air for a dog to get under it: about
  // 12 m out over flat snow, 1.9 s up and down. Aimed from about where it'll
  // leave the hand, let go `delay` s later; until then it's in the hand (hold).
  aim(from, dir, delay) {
    this.from.copy(from);
    this.toss.set(dir.x, 0, dir.z).normalize().multiplyScalar(6.5).setY(8.5);
    this.waiting = Math.max(delay, 1e-3);
    this.down = false;
    this.mesh.visible = false;
    this.#predict();
  }
  // In the hand at `p` (world), until it's let go from there.
  hold(p) {
    if (!(this.waiting > 0)) return;
    this.from.copy(p);
    this.mesh.visible = true;
  }
  // Where it'll come down, run on ahead.
  #predict() {
    const p = _w.copy(this.from), v = _u.copy(this.toss);
    for (let i = 0; i < 400; i++) {
      v.y -= G / 60;
      p.addScaledVector(v, 1 / 60);
      if (p.y <= this.hf.heightAt(p.x, p.z)) break;
    }
    this.landing.copy(p);
  }
  update(dt, spray, events) {
    if (this.waiting > 0 && (this.waiting -= dt) <= 0) {
      this.pos.copy(this.from);
      this.vel.copy(this.toss);
      this.flying = true;
      this.mesh.visible = true;
      this.#predict(); // from where the hand let it go
      events.push({ type: 'swish', at: this.pos.clone() });
    }
    if (this.flying) {
      this.vel.y -= G * dt;
      this.pos.addScaledVector(this.vel, dt);
      const ground = this.hf.heightAt(this.pos.x, this.pos.z);
      if (this.pos.y <= ground + 0.04) {
        this.pos.y = ground + 0.04;
        this.flying = false;
        this.down = true;
        this.left = 6;
        spray.emit(this.pos, _v.set(this.vel.x * 0.1, 0.5, this.vel.z * 0.1), 10, 1.4);
        events.push({ type: 'thud', at: this.pos.clone() });
      }
      this.last.copy(this.pos);
    } else if (this.down && (this.left -= dt) <= 0) this.melt();
    this.mesh.position.copy(this.waiting > 0 ? this.from : this.pos);
    if (this.flying) this.mesh.rotation.x += dt * 6;
  }
  // Caught in the air: a burst of snow.
  pop(spray, events) {
    spray.emit(this.pos, _v.set(0, 0.5, 0), 22, 2.2);
    events.push({ type: 'pop', at: this.pos.clone() });
    this.last.copy(this.pos);
    this.flying = this.down = false;
    this.mesh.visible = false;
  }
  // Dug apart, or melted.
  melt() {
    this.down = false;
    this.mesh.visible = false;
  }
}

// How far (x, z) is outside a rotated box { x, z, yaw, hw, hd }; 0 inside it.
function boxGap(o, x, z) {
  const c = Math.cos(o.yaw), s = Math.sin(o.yaw), dx = x - o.x, dz = z - o.z;
  return Math.hypot(Math.max(0, Math.abs(dx * c - dz * s) - o.hw), Math.max(0, Math.abs(dx * s + dz * c) - o.hd));
}
