import { useCallback, useEffect, useRef, useState } from 'react';
import { Waves, Zap, ArrowRight, Mail, Phone, MapPin } from 'lucide-react';

type FeedPellet = {
  id: string;
  x: number;
  y: number;
  size: number;
  speed: number;
  drift: number;
  driftPhase: number;
  createdAt: number;
};

type EatBurst = {
  id: string;
  x: number;
  y: number;
  createdAt: number;
};

type AquariumFish = {
  id: string;
  symbol: string;
  size: number;
  initialX: number;
  initialY: number;
  roamSpeed: number;
  chaseSpeed: number;
  mouthOffset: number;
  mouthRadius: number;
  curiosity: number;
  minY?: number;
  maxY?: number;
};

type MovingFish = AquariumFish & {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  direction: 1 | -1;
  mode: 'roaming' | 'chasing' | 'ignoring';
  chaseFeedId: string;
  ignoreUntil: number;
  nextDecisionAt: number;
  snackUntil: number;
  isSnacking: boolean;
};

const MAX_FEEDS = 22;
const FEED_TTL_MS = 9000;
const FEED_CLICK_COOLDOWN_MS = 180;
const FEED_MIN_X = 8;
const FEED_MAX_X = 92;
const FEED_MIN_Y = 12;
const FEED_MAX_SPAWN_Y = 72;
const FEED_FLOOR_Y = 88;
const EAT_BURST_TTL_MS = 650;
const FISH_MIN_X = 12;
const FISH_MAX_X = 88;
const FISH_MIN_Y = 18;
const FISH_MAX_Y = 86;
const FISH_TARGET_REACHED_DISTANCE = 2.2;
const aquariumFish: AquariumFish[] = [
  {
    id: 'tang',
    symbol: String.fromCodePoint(0x1f420),
    size: 46,
    initialX: 25,
    initialY: 33,
    roamSpeed: 7.4,
    chaseSpeed: 19,
    mouthOffset: 5.8,
    mouthRadius: 5.8,
    curiosity: 0.68,
  },
  {
    id: 'guppy',
    symbol: String.fromCodePoint(0x1f41f),
    size: 38,
    initialX: 66,
    initialY: 50,
    roamSpeed: 6.2,
    chaseSpeed: 16.5,
    mouthOffset: 5,
    mouthRadius: 5.1,
    curiosity: 0.52,
  },
  {
    id: 'goldie',
    symbol: String.fromCodePoint(0x1f421),
    size: 30,
    initialX: 34,
    initialY: 72,
    roamSpeed: 5.7,
    chaseSpeed: 15.2,
    mouthOffset: 4.2,
    mouthRadius: 4.8,
    curiosity: 0.62,
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getRandomNumber(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function createRoamTarget(fish?: AquariumFish) {
  return {
    x: getRandomNumber(FISH_MIN_X, FISH_MAX_X),
    y: getRandomNumber(fish?.minY ?? FISH_MIN_Y, fish?.maxY ?? FISH_MAX_Y),
  };
}

function createFishState(fish: AquariumFish): MovingFish {
  const target = createRoamTarget(fish);

  return {
    ...fish,
    x: fish.initialX,
    y: fish.initialY,
    targetX: target.x,
    targetY: target.y,
    direction: target.x >= fish.initialX ? 1 : -1,
    mode: 'roaming',
    chaseFeedId: '',
    ignoreUntil: 0,
    nextDecisionAt: 0,
    snackUntil: 0,
    isSnacking: false,
  };
}

function getNearestFeed(fish: MovingFish, feeds: FeedPellet[]) {
  return feeds.reduce<FeedPellet | null>((nearest, feed) => {
    if (!nearest) {
      return feed;
    }

    const nearestDistance = Math.hypot(nearest.x - fish.x, nearest.y - fish.y);
    const feedDistance = Math.hypot(feed.x - fish.x, feed.y - fish.y);

    return feedDistance < nearestDistance ? feed : nearest;
  }, null);
}

function moveFishToward(fish: MovingFish, targetX: number, targetY: number, speed: number, deltaSeconds: number) {
  const dx = targetX - fish.x;
  const dy = targetY - fish.y;
  const distance = Math.hypot(dx, dy);

  if (distance <= FISH_TARGET_REACHED_DISTANCE) {
    return {
      x: fish.x,
      y: fish.y,
      direction: fish.direction,
    };
  }

  const travel = Math.min(distance, speed * deltaSeconds);
  const nextDirection: 1 | -1 = dx >= 0 ? 1 : -1;

  return {
    x: clamp(fish.x + (dx / distance) * travel, FISH_MIN_X, FISH_MAX_X),
    y: clamp(
      fish.y + (dy / distance) * travel,
      fish.minY ?? FISH_MIN_Y,
      fish.maxY ?? FISH_MAX_Y
    ),
    direction: nextDirection,
  };
}

function getFishMouthPosition(fish: MovingFish) {
  return {
    x: fish.x + fish.mouthOffset * fish.direction,
    y: fish.y,
  };
}

function createFeedPellet(x: number, y: number, now: number, index: number): FeedPellet {
  return {
    id: `${Math.round(now)}-${index}-${Math.random().toString(36).slice(2)}`,
    x: clamp(x + getRandomNumber(-3.4, 3.4), FEED_MIN_X, FEED_MAX_X),
    y: clamp(y + getRandomNumber(-2.2, 2.2), FEED_MIN_Y, FEED_MAX_SPAWN_Y),
    size: getRandomNumber(5, 8),
    speed: getRandomNumber(5.4, 7.6),
    drift: getRandomNumber(0.8, 1.8),
    driftPhase: getRandomNumber(0, Math.PI * 2),
    createdAt: now,
  };
}

const initialFishStates = aquariumFish.map(createFishState);

export default function Landing({ onGetStarted }: { onGetStarted: () => void }) {
  const [feeds, setFeeds] = useState<FeedPellet[]>([]);
  const [eatBursts, setEatBursts] = useState<EatBurst[]>([]);
  const [fishStates, setFishStates] = useState<MovingFish[]>(() => initialFishStates);

  const feedsRef = useRef<FeedPellet[]>([]);
  const eatBurstsRef = useRef<EatBurst[]>([]);
  const fishStatesRef = useRef<MovingFish[]>(initialFishStates);
  const lastFeedClickRef = useRef(0);

  const spawnFeeds = useCallback((x: number, y: number, now = performance.now()) => {
    const availableSlots = MAX_FEEDS - feedsRef.current.length;

    if (availableSlots <= 0) {
      return;
    }

    const pelletCount = Math.min(availableSlots, 2 + Math.floor(Math.random() * 3));
    const nextFeeds = [
      ...feedsRef.current,
      ...Array.from({ length: pelletCount }, (_, index) =>
        createFeedPellet(x, y, now, index)
      ),
    ];

    feedsRef.current = nextFeeds;
    setFeeds(nextFeeds);
  }, []);

  const handleAquariumFeed = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const now = performance.now();

    if (now - lastFeedClickRef.current < FEED_CLICK_COOLDOWN_MS) {
      return;
    }

    lastFeedClickRef.current = now;

    const aquariumBounds = event.currentTarget.getBoundingClientRect();
    const x = clamp(
      ((event.clientX - aquariumBounds.left) / aquariumBounds.width) * 100,
      FEED_MIN_X,
      FEED_MAX_X
    );
    const y = clamp(
      ((event.clientY - aquariumBounds.top) / aquariumBounds.height) * 100,
      FEED_MIN_Y,
      FEED_MAX_SPAWN_Y
    );

    spawnFeeds(x, y, now);
  }, [spawnFeeds]);

  const handleAquariumKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    spawnFeeds(50, 18);
  }, [spawnFeeds]);

  useEffect(() => {
    let frameId = 0;
    let previousTime = performance.now();

    const animateAquarium = (now: number) => {
      const deltaSeconds = Math.min((now - previousTime) / 1000, 0.08);
      let nextFeeds = feedsRef.current
        .filter((feed) => now - feed.createdAt <= FEED_TTL_MS)
        .map((feed) => ({
          ...feed,
          x: clamp(
            feed.x + Math.sin(now / 650 + feed.driftPhase) * feed.drift * deltaSeconds,
            FEED_MIN_X,
            FEED_MAX_X
          ),
          y: Math.min(FEED_FLOOR_Y, feed.y + feed.speed * deltaSeconds),
        }));
      const nextEatBursts = eatBurstsRef.current.filter(
        (burst) => now - burst.createdAt < EAT_BURST_TTL_MS
      );

      previousTime = now;

      const nextFishStates = fishStatesRef.current.map((fish) => {
        const trackedFeed =
          fish.mode === 'chasing'
            ? nextFeeds.find((feed) => feed.id === fish.chaseFeedId) || null
            : null;
        const nearestFeed = getNearestFeed(fish, nextFeeds);
        let targetFeed: FeedPellet | null = trackedFeed;
        let nextMode: MovingFish['mode'] = trackedFeed ? 'chasing' : 'roaming';
        let nextChaseFeedId = trackedFeed?.id || '';
        let nextIgnoreUntil = fish.ignoreUntil > now ? fish.ignoreUntil : 0;
        let nextDecisionAt = fish.nextDecisionAt;

        if (!targetFeed && nearestFeed) {
          if (nextIgnoreUntil > now) {
            nextMode = 'ignoring';
          } else if (now >= nextDecisionAt) {
            const shouldChase = Math.random() < fish.curiosity;

            if (shouldChase) {
              targetFeed = nearestFeed;
              nextMode = 'chasing';
              nextChaseFeedId = nearestFeed.id;
              nextDecisionAt = now + getRandomNumber(900, 1800);
            } else {
              nextMode = 'ignoring';
              nextIgnoreUntil = now + getRandomNumber(900, 2400);
              nextDecisionAt = nextIgnoreUntil;
            }
          }
        }

        const roamTargetReached =
          Math.hypot(fish.targetX - fish.x, fish.targetY - fish.y) <
          FISH_TARGET_REACHED_DISTANCE;
        const roamTarget = !targetFeed && roamTargetReached ? createRoamTarget(fish) : null;
        const targetX = targetFeed?.x ?? roamTarget?.x ?? fish.targetX;
        const targetY = targetFeed?.y ?? roamTarget?.y ?? fish.targetY;
        const movedFish = moveFishToward(
          fish,
          targetX,
          targetY,
          targetFeed ? fish.chaseSpeed : fish.roamSpeed,
          deltaSeconds
        );
        const nextFish = {
          ...fish,
          x: movedFish.x,
          y: movedFish.y,
          direction: movedFish.direction,
          targetX,
          targetY,
          mode: nextMode,
          chaseFeedId: nextChaseFeedId,
          ignoreUntil: nextIgnoreUntil,
          nextDecisionAt,
          snackUntil: fish.snackUntil > now ? fish.snackUntil : 0,
          isSnacking: fish.snackUntil > now,
        } satisfies MovingFish;
        const mouthPosition = getFishMouthPosition(nextFish);
        const eatenFeed = targetFeed
          ? nextFeeds.find(
              (feed) =>
                feed.id === targetFeed.id &&
                Math.hypot(feed.x - mouthPosition.x, feed.y - mouthPosition.y) <=
                  nextFish.mouthRadius
            )
          : null;

        if (!eatenFeed) {
          return nextFish;
        }

        const nextRoamTarget = createRoamTarget(fish);

        nextFeeds = nextFeeds.filter((feed) => feed.id !== eatenFeed.id);
        nextEatBursts.push({
          id: `${eatenFeed.id}-eaten-${Math.round(now)}`,
          x: eatenFeed.x,
          y: eatenFeed.y,
          createdAt: now,
        });

        return {
          ...nextFish,
          targetX: nextRoamTarget.x,
          targetY: nextRoamTarget.y,
          mode: 'roaming',
          chaseFeedId: '',
          ignoreUntil: now + getRandomNumber(450, 950),
          nextDecisionAt: now + getRandomNumber(900, 1800),
          snackUntil: now + 420,
          isSnacking: true,
        } satisfies MovingFish;
      });

      if (feedsRef.current.length > 0 || nextFeeds.length > 0) {
        feedsRef.current = nextFeeds;
        setFeeds(nextFeeds);
      }

      const eatBurstsChanged =
        eatBurstsRef.current.length !== nextEatBursts.length ||
        nextEatBursts.some((burst, index) => eatBurstsRef.current[index]?.id !== burst.id);

      if (eatBurstsChanged) {
        eatBurstsRef.current = nextEatBursts;
        setEatBursts(nextEatBursts);
      }

      fishStatesRef.current = nextFishStates;
      setFishStates(nextFishStates);

      frameId = window.requestAnimationFrame(animateAquarium);
    };

    frameId = window.requestAnimationFrame(animateAquarium);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950">

      <nav className="fixed top-0 w-full bg-slate-950/80 backdrop-blur-sm border-b border-slate-800 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
              <Waves className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-white">SmartAqua <span className="text-cyan-400">Pro</span></span>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <a href="#home" className="text-sm text-slate-400 hover:text-white transition-colors">Home</a>
            <a href="#features" className="text-sm text-slate-400 hover:text-white transition-colors">Features</a>
            <a href="#about" className="text-sm text-slate-400 hover:text-white transition-colors">About</a>
            <a href="#team" className="text-sm text-slate-400 hover:text-white transition-colors">Team</a>
            <a href="#contact" className="text-sm text-slate-400 hover:text-white transition-colors">Contact</a>
            <button onClick={onGetStarted} className="px-5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-cyan-600/20">Login</button>
          </div>
          <button onClick={onGetStarted} className="md:hidden px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-all">Login</button>
        </div>
      </nav>

      {/* Hero */}
      <section id="home" className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-full text-xs text-cyan-400 mb-6">
                <Zap className="w-3.5 h-3.5" /> IoT-Based Aquarium Management System
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
                Smart Aquarium<br />
                <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">Monitoring, Automation</span><br />
                & Management
              </h1>
              <p className="text-base text-slate-400 mb-8 leading-relaxed">
                SmartAqua Pro is an IoT-based intelligent aquarium monitoring, automation, and management system that provides real-time monitoring, automated control, and centralized digital supervision of aquarium environments.
              </p>
              <div className="flex items-center gap-4">
                <button onClick={onGetStarted} className="flex items-center gap-2 px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-cyan-600/20">
                  Get Started <ArrowRight className="w-4 h-4" />
                </button>
                <a href="#features" className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-all border border-slate-700">Learn More</a>
              </div>
              <div className="grid grid-cols-4 gap-4 mt-10">
                {[
                  { value: '4', label: 'Aquariums' },
                  { value: '5+', label: 'Sensors' },
                  { value: '6+', label: 'Rules' },
                  { value: '3', label: 'User Roles' },
                ].map((stat) => (
                  <div key={stat.label} className="text-center bg-slate-800/50 border border-slate-700/50 rounded-xl py-3">
                    <p className="text-xl font-bold text-cyan-400">{stat.value}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-center">
              <div className="relative w-110 h-[30rem] rounded-[2rem] border-[10px] border-slate-700 bg-slate-900 shadow-2xl shadow-cyan-950/40">
                <div className="absolute -top-2 left-10 right-10 h-3 rounded-full bg-gradient-to-r from-slate-500 via-slate-300 to-slate-600 shadow-lg shadow-cyan-900/30" />
                <div className="absolute -bottom-3 left-8 right-8 h-5 rounded-b-2xl bg-gradient-to-b from-slate-700 to-slate-950 shadow-lg shadow-black/40" />
                <div className="absolute inset-0 rounded-[1.45rem] border border-white/15 pointer-events-none z-40" />
                <div
                  className="absolute inset-1 rounded-[1.35rem] border-2 border-cyan-300/25 bg-gradient-to-b from-cyan-300/10 via-blue-500/15 to-blue-950/30 overflow-hidden cursor-pointer shadow-inner shadow-cyan-300/10"
                  role="button"
                  tabIndex={0}
                  aria-label="Feed the virtual aquarium"
                  onPointerDown={handleAquariumFeed}
                  onKeyDown={handleAquariumKeyDown}
                >
                  <div className="absolute left-3 top-4 bottom-12 w-px bg-white/25 pointer-events-none" />
                  <div className="absolute right-4 top-6 bottom-16 w-px bg-cyan-100/10 pointer-events-none" />
                  <div className="absolute left-8 right-8 top-3 h-px bg-white/30 pointer-events-none" />
                  <div className="h-8 bg-gradient-to-b from-cyan-400/10 to-transparent">
                    <div className="w-full h-full flex">
                      <div className="w-1/3 h-full bg-cyan-400/5 animate-pulse rounded-b-full" />
                      <div className="w-1/4 h-full bg-cyan-400/8 animate-pulse rounded-b-full" style={{ animationDelay: '0.5s' }} />
                    </div>
                  </div>
                  <div className="absolute left-1/4 bottom-0">
                    <div className="w-3 h-3 bg-cyan-400/20 rounded-full animate-bounce" style={{ animationDuration: '3s', animationIterationCount: 'infinite' }} />
                  </div>
                  <div className="absolute left-1/2 bottom-4">
                    <div className="w-2 h-2 bg-cyan-400/15 rounded-full animate-bounce" style={{ animationDuration: '2.5s', animationDelay: '1s', animationIterationCount: 'infinite' }} />
                  </div>
                  <div className="absolute left-2/3 bottom-2">
                    <div className="w-2.5 h-2.5 bg-cyan-400/15 rounded-full animate-bounce" style={{ animationDuration: '3.5s', animationDelay: '0.3s', animationIterationCount: 'infinite' }} />
                  </div>
                  <div className="absolute left-1/3 bottom-6">
                    <div className="w-2 h-2 bg-cyan-400/10 rounded-full animate-bounce" style={{ animationDuration: '4s', animationDelay: '1.5s', animationIterationCount: 'infinite' }} />
                  </div>
                  {feeds.map((feed) => (
                    <div
                      key={feed.id}
                      className="absolute z-20 pointer-events-none rounded-full bg-amber-300"
                      style={{
                        left: `${feed.x}%`,
                        top: `${feed.y}%`,
                        width: `${feed.size}px`,
                        height: `${feed.size}px`,
                        transform: 'translate(-50%, -50%)',
                        boxShadow: '0 0 10px rgba(251, 191, 36, 0.75)',
                      }}
                    >
                      <div className="absolute inset-[2px] rounded-full bg-yellow-100/80" />
                    </div>
                  ))}
                  {eatBursts.map((burst) => (
                    <div
                      key={burst.id}
                      className="absolute z-20 pointer-events-none rounded-full border border-amber-200/80 animate-ping"
                      style={{
                        left: `${burst.x}%`,
                        top: `${burst.y}%`,
                        width: '18px',
                        height: '18px',
                        transform: 'translate(-50%, -50%)',
                      }}
                    />
                  ))}
                  {fishStates.map((fish) => (
                    <div
                      key={fish.id}
                      className="absolute z-30 select-none pointer-events-none"
                      style={{
                        top: `${fish.y}%`,
                        left: `${fish.x}%`,
                        fontSize: `${fish.size}px`,
                        transform: `translate(-50%, -50%) scaleX(${fish.direction === 1 ? -1 : 1})`,
                      }}
                    >
                      <span
                        className={`inline-block transition-transform duration-200 ${
                          fish.isSnacking
                            ? 'scale-125 -rotate-6'
                            : fish.mode === 'chasing'
                              ? 'scale-110'
                              : fish.mode === 'ignoring'
                                ? 'opacity-80'
                              : ''
                        }`}
                      >
                        {fish.symbol}
                      </span>
                    </div>
                  ))}
                  <div className="absolute bottom-0 left-6 text-3xl">🌿</div>
                  <div className="absolute bottom-0 right-8 text-2xl">🌱</div>
                  <div className="absolute bottom-0 left-1/2 text-2xl">🌿</div>
                  <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-amber-950/60 via-amber-900/25 to-transparent rounded-b-[1.2rem]" />
                  <div className="absolute bottom-1 left-6 right-8 h-3 rounded-full bg-gradient-to-r from-stone-700/50 via-amber-700/30 to-stone-800/50 blur-[1px]" />
                  <div className="absolute bottom-3 left-12 w-2 h-2 rounded-full bg-stone-400/40" />
                  <div className="absolute bottom-2 left-28 w-1.5 h-1.5 rounded-full bg-amber-200/30" />
                  <div className="absolute bottom-4 right-20 w-2.5 h-2.5 rounded-full bg-stone-500/40" />
                  <div className="absolute inset-0 bg-gradient-to-t from-cyan-500/5 to-transparent pointer-events-none" />
                </div>
                <div className="absolute -top-4 -right-4 bg-slate-800/90 border border-emerald-500/30 rounded-xl px-3 py-2 backdrop-blur-sm shadow-lg shadow-emerald-500/10" style={{ animation: 'float 4s ease-in-out infinite' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🌡️</span>
                    <div>
                      <p className="text-xs text-slate-500">Temp</p>
                      <p className="text-sm font-bold text-emerald-400">26.4°C ✓</p>
                    </div>
                  </div>
                </div>
                <div className="absolute top-1/3 -left-6 bg-slate-800/90 border border-cyan-500/30 rounded-xl px-3 py-2 backdrop-blur-sm shadow-lg shadow-cyan-500/10" style={{ animation: 'float 5s ease-in-out infinite', animationDelay: '1s' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">💧</span>
                    <div>
                      <p className="text-xs text-slate-500">Level</p>
                      <p className="text-sm font-bold text-cyan-400">85%</p>
                    </div>
                  </div>
                </div>
                <div className="absolute -bottom-4 right-4 bg-slate-800/90 border border-amber-500/30 rounded-xl px-3 py-2 backdrop-blur-sm shadow-lg shadow-amber-500/10" style={{ animation: 'float 4.5s ease-in-out infinite', animationDelay: '2s' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🚨</span>
                    <div>
                      <p className="text-xs text-slate-500">Alert</p>
                      <p className="text-sm font-bold text-amber-400">1 Warning</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features - NOW FIRST */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-3">Key Features</h2>
            <p className="text-slate-400 max-w-lg mx-auto">Everything you need to monitor, automate, and manage your aquarium ecosystem.</p>
            <div className="w-16 h-1 bg-cyan-500 mx-auto rounded-full mt-3"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: '🌡️', title: 'Real-time Monitoring', desc: 'Track temperature, water level, water quality, pH, and turbidity in real-time with live sensor data.', color: 'from-orange-500 to-red-500' },
              { icon: '⚙️', title: 'Intelligent Automation', desc: 'Rule-based automation for feeding, lighting, and filtration with bioload-based fish classification.', color: 'from-purple-500 to-indigo-500' },
              { icon: '🔔', title: 'Alert & Notification', desc: 'Instant warnings for abnormal conditions, system risks, and power outage detection.', color: 'from-amber-500 to-orange-500' },
              { icon: '📊', title: 'Data Logging & Reports', desc: 'Historical data analysis, interactive charts, and exportable CSV reports for long-term management.', color: 'from-emerald-500 to-green-500' },
              { icon: '🛡️', title: 'User Management', desc: 'Role-based access control with Admin, Operator, and Viewer permissions.', color: 'from-red-500 to-pink-500' },
              { icon: '📱', title: 'Mobile Accessible', desc: 'Monitor and control your aquariums anytime, anywhere through web and mobile.', color: 'from-cyan-500 to-blue-500' },
            ].map((feature) => (
              <div key={feature.title} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 hover:border-cyan-500/30 transition-all">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 text-xl`}>
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-slate-400">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About - NOW SECOND */}
      <section id="about" className="py-20 px-6 bg-slate-900/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-3">About the Project</h2>
            <div className="w-16 h-1 bg-cyan-500 mx-auto rounded-full"></div>
          </div>
          <p className="text-center max-w-3xl mx-auto text-slate-400 leading-relaxed mb-6">Aquarium management requires continuous monitoring of environmental conditions such as water temperature, water level, water quality, lighting, and feeding schedules to maintain a stable and healthy aquatic ecosystem.</p>
          <p className="text-center max-w-3xl mx-auto text-slate-400 leading-relaxed">SmartAqua Pro addresses these challenges by integrating IoT-based sensing, rule-based automation, real-time alerts, and digital record management into a single platform.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10">
            <div className="text-center bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
              <div className="text-3xl mb-3">🏠</div>
              <h4 className="text-white font-semibold mb-2">Home Aquariums</h4>
              <p className="text-sm text-slate-400">Help hobbyists monitor water conditions, automate feeding and lighting, and reduce risks.</p>
            </div>
            <div className="text-center bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
              <div className="text-3xl mb-3">🏫</div>
              <h4 className="text-white font-semibold mb-2">Schools & Facilities</h4>
              <p className="text-sm text-slate-400">Assist schools in maintaining aquarium stability and reducing manual care dependency.</p>
            </div>
            <div className="text-center bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
              <div className="text-3xl mb-3">🔬</div>
              <h4 className="text-white font-semibold mb-2">Research & Labs</h4>
              <p className="text-sm text-slate-400">Support research with data logging, historical analysis, and long-term management.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Objectives */}
      <section id="objectives" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-3">Project Objectives</h2>
            <div className="w-16 h-1 bg-cyan-500 mx-auto rounded-full mt-3"></div>
          </div>
          <div className="space-y-4">
            {[
              { num: '01', text: 'Develop an IoT-based data collection and monitoring system that gathers real-time aquarium parameters such as temperature, water level, and water quality.' },
              { num: '02', text: 'Design and implement rule-based intelligent automation for feeding, lighting, and filtration using predefined thresholds, conditions, schedules, and bioload-based fish classification.' },
              { num: '03', text: 'Develop a centralized monitoring platform (web and mobile application) for real-time monitoring, remote control, user management, and improved accessibility.' },
              { num: '04', text: 'Integrate an alert and notification system that provides real-time warnings for abnormal conditions, system risks, and power outages.' },
              { num: '05', text: 'Implement data logging, historical analysis, and reporting features to support system evaluation, decision-making, and long-term aquarium management.' },
            ].map((obj) => (
              <div key={obj.num} className="flex items-start gap-4 bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 hover:border-cyan-500/30 transition-all">
                <span className="text-2xl font-bold text-cyan-400 flex-shrink-0">{obj.num}</span>
                <p className="text-sm text-slate-300 pt-1">{obj.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section id="team" className="py-20 px-6 bg-slate-900/50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-3">Development Team</h2>
          <p className="text-slate-400 mb-10">BS Information Technology • Institute of Computing • DNSC</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { name: 'Dennis Mark L. Jamero', role: 'Lead Developer', initials: 'DM' },
              { name: 'Wendyl Ziv S. Arellano', role: 'Backend Developer', initials: 'WA' },
              { name: 'Gian Carlo R. Marin', role: 'IoT & Hardware', initials: 'GM' },
            ].map((member) => (
              <div key={member.name} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 hover:border-cyan-500/30 transition-all">
                <div className="w-20 h-20 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-white">{member.initials}</span>
                </div>
                <h4 className="text-white font-semibold text-lg">{member.name}</h4>
                <p className="text-sm text-cyan-400 mt-1">{member.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-3">Contact Us</h2>
            <p className="text-slate-400">Have questions? Get in touch with the SmartAqua Pro team.</p>
            <div className="w-16 h-1 bg-cyan-500 mx-auto rounded-full mt-3"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center flex-shrink-0"><MapPin className="w-5 h-5 text-cyan-400" /></div>
                <div>
                  <h4 className="text-white font-medium">Location</h4>
                  <p className="text-sm text-slate-400">Davao del Norte State College, Panabo City</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center flex-shrink-0"><Mail className="w-5 h-5 text-cyan-400" /></div>
                <div>
                  <h4 className="text-white font-medium">Email</h4>
                  <p className="text-sm text-slate-400">smartaqua.pro@dnsc.edu.ph</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center flex-shrink-0"><Phone className="w-5 h-5 text-cyan-400" /></div>
                <div>
                  <h4 className="text-white font-medium">Phone</h4>
                  <p className="text-sm text-slate-400">09912879123</p>
                </div>
              </div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Send a Message</h3>
              <div className="space-y-3">
                <input type="text" placeholder="Your Name" className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                <input type="email" placeholder="Your Email" className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                <textarea placeholder="Your Message" rows={4} className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none" />
                <button className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-all">Send Message</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-slate-900/50">
        <div className="max-w-3xl mx-auto text-center">
          <div className="bg-gradient-to-br from-cyan-600/20 to-blue-600/20 border border-cyan-500/30 rounded-2xl p-10">
            <Waves className="w-12 h-12 text-cyan-400 mx-auto mb-4" />
            <h2 className="text-3xl font-bold text-white mb-3">Ready to Get Started?</h2>
            <p className="text-slate-400 mb-6">Experience intelligent aquarium monitoring and automation with SmartAqua Pro.</p>
            <button onClick={onGetStarted} className="inline-flex items-center gap-2 px-8 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-base font-medium transition-all shadow-lg shadow-cyan-600/20">
              Launch Dashboard <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center"><Waves className="w-4 h-4 text-white" /></div>
            <span className="text-sm text-slate-400">SmartAqua Pro © 2026</span>
          </div>
          <div className="text-center">
            <p className="text-sm text-slate-500">Davao del Norte State College</p>
            <p className="text-xs text-slate-600">Institute of Computing • Panabo City, Davao del Norte</p>
          </div>
          <div className="text-xs text-slate-600">BS Information Technology</div>
        </div>
      </footer>
    </div>
  );
}
