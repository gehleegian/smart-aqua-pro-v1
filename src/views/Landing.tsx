import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Bell,
  BarChart3,
  Building2,
  Cpu,
  Droplets,
  FlaskConical,
  Home,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Smartphone,
  Thermometer,
  TriangleAlert,
  Waves,
  Zap,
} from 'lucide-react';
import UnderwaterBackground from '../components/ui/UnderwaterBackground';

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

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300';
const navLinkClassName = `rounded text-sm text-slate-200 transition-colors hover:text-white ${focusRing}`;
const glassCardClassName =
  'rounded-2xl border border-teal-100/10 bg-slate-950/55 shadow-lg shadow-slate-950/20 transition-colors hover:border-teal-200/30';
const primaryButtonClassName = `inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 font-semibold text-white shadow-lg shadow-teal-950/30 transition-colors hover:bg-teal-500 ${focusRing}`;
const fieldClassName =
  'w-full rounded-lg border border-slate-600/50 bg-slate-950/45 px-4 py-2.5 text-sm text-slate-50 placeholder-slate-400 focus:border-teal-300 focus:outline-2 focus:outline-offset-1 focus:outline-teal-300/60';

function BrandMark() {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/15 ring-1 ring-teal-300/30">
      <Waves className="h-5 w-5 text-teal-200" aria-hidden="true" />
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      <p className="mb-3 text-sm font-semibold text-teal-200">{eyebrow}</p>
      <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">{title}</h2>
      {description && <p className="mt-4 leading-relaxed text-slate-200">{description}</p>}
    </div>
  );
}

function TelemetryChip({
  icon: Icon,
  label,
  value,
  className,
  iconClassName,
  duration,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  className: string;
  iconClassName: string;
  duration: string;
}) {
  return (
    <div
      className={`absolute z-40 flex items-center gap-2 rounded-lg border border-teal-100/15 bg-slate-950/80 px-3 py-2 shadow-lg shadow-slate-950/30 ${className}`}
      style={{ animation: `float ${duration} ease-in-out infinite` }}
    >
      <Icon className={`h-4 w-4 ${iconClassName}`} />
      <div>
        <p className="text-xs text-slate-300">{label}</p>
        <p className="text-sm font-semibold text-white">{value}</p>
      </div>
    </div>
  );
}

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
    <div className="relative min-h-screen overflow-x-clip bg-slate-950">
      <UnderwaterBackground descendOnScroll />

      <nav aria-label="Main" className="fixed inset-x-0 top-0 z-50 px-4 pt-4">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between rounded-xl border border-teal-100/15 bg-slate-950/65 px-3 shadow-lg shadow-slate-950/25 backdrop-blur-md md:px-4">
          <a href="#home" className={`flex items-center gap-3 rounded-lg ${focusRing}`}>
            <BrandMark />
            <span className="text-base font-bold text-white">
              SmartAqua <span className="text-teal-200">Pro</span>
            </span>
          </a>
          <div className="flex items-center gap-6">
            <div className="hidden items-center gap-6 md:flex">
              <a href="#home" className={navLinkClassName}>Home</a>
              <a href="#features" className={navLinkClassName}>Features</a>
              <a href="#about" className={navLinkClassName}>About</a>
              <a href="#team" className={navLinkClassName}>Team</a>
              <a href="#contact" className={navLinkClassName}>Contact</a>
            </div>
            <button
              type="button"
              onClick={onGetStarted}
              className={`${primaryButtonClassName} px-4 py-2 text-sm`}
            >
              Login
            </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        <section id="home" className="scroll-mt-24 px-4 pb-20 pt-32 sm:px-6 md:min-h-screen md:pt-40">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-teal-200/25 bg-slate-950/50 px-4 py-1.5 text-xs font-medium text-teal-100">
                <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                IoT-Based Aquarium Management System
              </div>
              <h1 className="mb-6 text-4xl font-bold leading-[1.08] tracking-tight text-white [text-shadow:0_2px_24px_rgba(8,33,43,0.65)] sm:text-5xl xl:text-[3.5rem]">
                Smart Aquarium Monitoring, Automation & Management
              </h1>
              <p className="mb-8 max-w-xl text-lg leading-relaxed text-slate-100 [text-shadow:0_1px_12px_rgba(8,33,43,0.8)]">
                SmartAqua Pro is an IoT-based intelligent aquarium monitoring, automation, and management system that provides real-time monitoring, automated control, and centralized digital supervision of aquarium environments.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onGetStarted}
                  className={`${primaryButtonClassName} px-6 py-3 text-sm`}
                >
                  Get Started <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <a
                  href="#features"
                  className={`rounded-lg border border-teal-100/20 bg-slate-950/45 px-6 py-3 text-sm font-semibold text-slate-50 transition-colors hover:bg-slate-900/70 ${focusRing}`}
                >
                  Learn More
                </a>
              </div>
              <dl className="mt-10 grid max-w-xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-teal-100/10 bg-teal-100/10 sm:grid-cols-4">
                {[
                  { value: '4', label: 'Aquariums' },
                  { value: '5+', label: 'Sensors' },
                  { value: '6+', label: 'Rules' },
                  { value: '3', label: 'User Roles' },
                ].map((stat) => (
                  <div key={stat.label} className="bg-slate-950/70 px-4 py-3">
                    <dd className="text-xl font-bold text-white">{stat.value}</dd>
                    <dt className="mt-0.5 text-xs text-slate-300">{stat.label}</dt>
                  </div>
                ))}
              </dl>
            </div>

            <div className="relative mx-auto w-full max-w-md">
              <div className="relative h-[26rem]">
                <div
                  className={`relative h-full cursor-pointer overflow-hidden rounded-2xl ${focusRing}`}
                  role="button"
                  tabIndex={0}
                  aria-label="Feed the virtual aquarium"
                  onPointerDown={handleAquariumFeed}
                  onKeyDown={handleAquariumKeyDown}
                >
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
                </div>
              </div>
              <TelemetryChip icon={Thermometer} label="Temp" value="26.4°C" duration="4s" iconClassName="text-emerald-300" className="right-2 top-2" />
              <TelemetryChip icon={Droplets} label="Level" value="85%" duration="5s" iconClassName="text-teal-200" className="left-0 top-1/3" />
              <TelemetryChip icon={TriangleAlert} label="Alert" value="1 Warning" duration="4.5s" iconClassName="text-amber-300" className="bottom-8 right-6" />
              <p className="mt-4 text-center text-xs text-slate-100 [text-shadow:0_1px_8px_rgba(8,33,43,0.9)]">Tap the water to feed the fish. Values shown are samples.</p>
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-24 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <SectionHeading
              eyebrow="Platform"
              title="Key Features"
              description="Everything you need to monitor, automate, and manage your aquarium ecosystem."
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[
                { icon: Activity, title: 'Real-time Monitoring', desc: 'Track temperature, water level, water purity (TDS level), and pH in real-time with live sensor data.' },
                { icon: Cpu, title: 'Intelligent Automation', desc: 'Rule-based automation for feeding, lighting, and filtration with bioload-based fish classification.' },
                { icon: Bell, title: 'Alert & Notification', desc: 'Instant warnings for abnormal conditions, system risks, and power outage detection.' },
                { icon: BarChart3, title: 'Data Logging & Reports', desc: 'Historical data analysis, interactive charts, and exportable CSV reports for long-term management.' },
                { icon: ShieldCheck, title: 'User Management', desc: 'Role-based access control with Admin, Operator, and Viewer permissions.' },
                { icon: Smartphone, title: 'Mobile Accessible', desc: 'Monitor and control your aquariums anytime, anywhere through web and mobile.' },
              ].map((feature) => {
                const Icon = feature.icon;

                return (
                  <div key={feature.title} className={`${glassCardClassName} p-6`}>
                    <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-teal-500/15 ring-1 ring-teal-300/25">
                      <Icon className="h-5 w-5 text-teal-200" aria-hidden="true" />
                    </div>
                    <h3 className="mb-2 text-lg font-semibold text-white">{feature.title}</h3>
                    <p className="text-sm leading-relaxed text-slate-200">{feature.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="about" className="scroll-mt-24 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <SectionHeading eyebrow="Why SmartAqua" title="About the Project" />
            <div className="mx-auto mb-10 max-w-3xl space-y-5 text-center leading-relaxed text-slate-100">
              <p>Aquarium management requires continuous monitoring of environmental conditions such as water temperature, water level, water purity (TDS level), lighting, and feeding schedules to maintain a stable and healthy aquatic ecosystem.</p>
              <p>SmartAqua Pro addresses these challenges by integrating IoT-based sensing, rule-based automation, real-time alerts, and digital record management into a single platform.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {[
                { icon: Home, title: 'Home Aquariums', desc: 'Help hobbyists monitor water conditions, automate feeding and lighting, and reduce risks.' },
                { icon: Building2, title: 'Schools & Facilities', desc: 'Assist schools in maintaining aquarium stability and reducing manual care dependency.' },
                { icon: FlaskConical, title: 'Research & Labs', desc: 'Support research with data logging, historical analysis, and long-term management.' },
              ].map((audience) => {
                const Icon = audience.icon;

                return (
                  <div key={audience.title} className={`${glassCardClassName} p-6`}>
                    <Icon className="mb-4 h-6 w-6 text-teal-200" aria-hidden="true" />
                    <h3 className="mb-2 font-semibold text-white">{audience.title}</h3>
                    <p className="text-sm leading-relaxed text-slate-200">{audience.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="objectives" className="scroll-mt-24 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <SectionHeading eyebrow="Goals" title="Project Objectives" />
            <ol className="overflow-hidden rounded-2xl border border-teal-100/10 bg-slate-950/55">
              {[
                { num: '01', text: 'Develop an IoT-based data collection and monitoring system that gathers real-time aquarium parameters such as temperature, water level, and water purity (TDS level).' },
                { num: '02', text: 'Design and implement rule-based intelligent automation for feeding, lighting, and filtration using predefined thresholds, conditions, schedules, and bioload-based fish classification.' },
                { num: '03', text: 'Develop a centralized monitoring platform (web and mobile application) for real-time monitoring, remote control, user management, and improved accessibility.' },
                { num: '04', text: 'Integrate an alert and notification system that provides real-time warnings for abnormal conditions, system risks, and power outages.' },
                { num: '05', text: 'Implement data logging, historical analysis, and reporting features to support system evaluation, decision-making, and long-term aquarium management.' },
              ].map((objective) => (
                <li key={objective.num} className="flex items-start gap-4 border-b border-teal-100/10 p-5 last:border-b-0 sm:gap-6 sm:p-6">
                  <span className="flex-shrink-0 text-sm font-bold text-teal-200">{objective.num}</span>
                  <p className="text-sm leading-relaxed text-slate-100">{objective.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="team" className="scroll-mt-24 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <SectionHeading
              eyebrow="The people"
              title="Development Team"
              description="BS Information Technology • Institute of Computing • DNSC"
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {[
                { name: 'Dennis Mark L. Jamero', role: 'Lead Developer', initials: 'DM' },
                { name: 'Wendyl Ziv S. Arellano', role: 'Backend Developer', initials: 'WA' },
                { name: 'Gian Carlo R. Marin', role: 'IoT & Hardware', initials: 'GM' },
              ].map((member) => (
                <div key={member.name} className={`${glassCardClassName} p-6 text-center`}>
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-teal-500/20 ring-1 ring-teal-300/30">
                    <span className="text-lg font-bold text-white">{member.initials}</span>
                  </div>
                  <h3 className="font-semibold text-white">{member.name}</h3>
                  <p className="mt-1 text-sm text-teal-200">{member.role}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="scroll-mt-24 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <SectionHeading
              eyebrow="Contact"
              title="Contact Us"
              description="Have questions? Get in touch with the SmartAqua Pro team."
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className={`${glassCardClassName} space-y-6 p-6`}>
                {[
                  { icon: MapPin, title: 'Location', value: 'Davao del Norte State College, Panabo City' },
                  { icon: Mail, title: 'Email', value: 'smartaqua.pro@dnsc.edu.ph' },
                  { icon: Phone, title: 'Phone', value: '09912879123' },
                ].map((item) => {
                  const Icon = item.icon;

                  return (
                    <div key={item.title} className="flex items-start gap-4">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-teal-500/15">
                        <Icon className="h-5 w-5 text-teal-200" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-medium text-white">{item.title}</h3>
                        <p className="break-words text-sm text-slate-200">{item.value}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className={`${glassCardClassName} p-6`}>
                <h3 className="mb-4 text-lg font-semibold text-white">Send a Message</h3>
                <div className="space-y-3">
                  <input type="text" aria-label="Your Name" placeholder="Your Name" className={fieldClassName} />
                  <input type="email" aria-label="Your Email" placeholder="Your Email" className={fieldClassName} />
                  <textarea aria-label="Your Message" placeholder="Your Message" rows={4} className={`${fieldClassName} resize-none`} />
                  <button type="button" className={`${primaryButtonClassName} w-full py-2.5 text-sm`}>
                    Send Message
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-3xl rounded-2xl border border-teal-200/25 bg-slate-950/65 p-8 text-center shadow-xl shadow-slate-950/30 sm:p-12">
            <h2 className="mb-3 text-3xl font-bold tracking-tight text-white md:text-4xl">Ready to Get Started?</h2>
            <p className="mb-7 text-slate-200">Experience intelligent aquarium monitoring and automation with SmartAqua Pro.</p>
            <button
              type="button"
              onClick={onGetStarted}
              className={`${primaryButtonClassName} px-7 py-3 text-base`}
            >
              Launch Dashboard <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-teal-100/10 bg-slate-950/70 px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-center md:flex-row md:text-left">
          <div className="flex items-center gap-3">
            <BrandMark />
            <span className="text-sm text-slate-200">SmartAqua Pro © 2026</span>
          </div>
          <div>
            <p className="text-sm text-slate-200">Davao del Norte State College</p>
            <p className="text-xs text-slate-300">Institute of Computing • Panabo City, Davao del Norte</p>
          </div>
          <div className="text-xs text-slate-300">BS Information Technology</div>
        </div>
      </footer>
    </div>
  );
}
