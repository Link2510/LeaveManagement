import React, { useCallback, useEffect, useId, useRef } from 'react';
import type { Employee } from '../types/leave';

export interface AvatarPresetSpec {
  id: string;
  label: string;
  vehicle:
    | 'scooter-yellow'
    | 'scooter-mint'
    | 'scooter-pink'
    | 'mini-car'
    | 'skateboard'
    | 'bicycle'
    | 'rocket'
    | 'coffee'
    | 'escooter'
    | 'office-chair'
    | 'sportbike'
    | 'cloud';
  primary: string;
  secondary: string;
  accent: string;
  skin: string;
  hair: string;
  headAccessory: 'goggles' | 'glasses' | 'bow' | 'cap' | 'headset' | 'crown' | 'none';
  hairStyle: 'pigtails' | 'short' | 'bob' | 'spiky' | 'bun' | 'wavy';
}

export const AVATAR_PRESETS: AvatarPresetSpec[] = [
  {
    id: 'avatar_01',
    label: 'Xe tay ga vàng',
    vehicle: 'scooter-yellow',
    primary: '#facc15',
    secondary: '#fef08a',
    accent: '#ef4444',
    skin: '#fde0cc',
    hair: '#292524',
    headAccessory: 'goggles',
    hairStyle: 'pigtails',
  },
  {
    id: 'avatar_02',
    label: 'Vespa xanh bạc hà',
    vehicle: 'scooter-mint',
    primary: '#2dd4bf',
    secondary: '#ccfbf1',
    accent: '#f97316',
    skin: '#f6c9ad',
    hair: '#1e293b',
    headAccessory: 'glasses',
    hairStyle: 'short',
  },
  {
    id: 'avatar_03',
    label: 'Scooter hồng kẹo',
    vehicle: 'scooter-pink',
    primary: '#f472b6',
    secondary: '#fce7f3',
    accent: '#fbbf24',
    skin: '#fde2cf',
    hair: '#451a03',
    headAccessory: 'bow',
    hairStyle: 'bob',
  },
  {
    id: 'avatar_04',
    label: 'Xe mui trần đỏ',
    vehicle: 'mini-car',
    primary: '#ef4444',
    secondary: '#fee2e2',
    accent: '#facc15',
    skin: '#f1bfa0',
    hair: '#0f172a',
    headAccessory: 'goggles',
    hairStyle: 'spiky',
  },
  {
    id: 'avatar_05',
    label: 'Ván trượt năng động',
    vehicle: 'skateboard',
    primary: '#38bdf8',
    secondary: '#e0f2fe',
    accent: '#fb7185',
    skin: '#f7cfb5',
    hair: '#18181b',
    headAccessory: 'cap',
    hairStyle: 'short',
  },
  {
    id: 'avatar_06',
    label: 'Xe đạp giỏ hoa',
    vehicle: 'bicycle',
    primary: '#60a5fa',
    secondary: '#dbeafe',
    accent: '#f59e0b',
    skin: '#fad6be',
    hair: '#581c87',
    headAccessory: 'bow',
    hairStyle: 'wavy',
  },
  {
    id: 'avatar_07',
    label: 'Tên lửa tăng tốc',
    vehicle: 'rocket',
    primary: '#f97316',
    secondary: '#ffedd5',
    accent: '#38bdf8',
    skin: '#f2c1a2',
    hair: '#1e293b',
    headAccessory: 'goggles',
    hairStyle: 'spiky',
  },
  {
    id: 'avatar_08',
    label: 'Cà phê sáng',
    vehicle: 'coffee',
    primary: '#b45309',
    secondary: '#fef3c7',
    accent: '#10b981',
    skin: '#f8d0b6',
    hair: '#3f2e21',
    headAccessory: 'glasses',
    hairStyle: 'bun',
  },
  {
    id: 'avatar_09',
    label: 'Xe điện xanh dương',
    vehicle: 'escooter',
    primary: '#4f46e5',
    secondary: '#e0e7ff',
    accent: '#22d3ee',
    skin: '#efc0a1',
    hair: '#0f172a',
    headAccessory: 'headset',
    hairStyle: 'short',
  },
  {
    id: 'avatar_10',
    label: 'Ghế xoay văn phòng',
    vehicle: 'office-chair',
    primary: '#0f766e',
    secondary: '#ccfbf1',
    accent: '#f59e0b',
    skin: '#f6c8aa',
    hair: '#27272a',
    headAccessory: 'headset',
    hairStyle: 'bob',
  },
  {
    id: 'avatar_11',
    label: 'Mô tô thể thao',
    vehicle: 'sportbike',
    primary: '#ea580c',
    secondary: '#fed7aa',
    accent: '#0ea5e9',
    skin: '#eab594',
    hair: '#18181b',
    headAccessory: 'cap',
    hairStyle: 'spiky',
  },
  {
    id: 'avatar_12',
    label: 'Đám mây vui vẻ',
    vehicle: 'cloud',
    primary: '#a855f7',
    secondary: '#f3e8ff',
    accent: '#facc15',
    skin: '#fde2cf',
    hair: '#422006',
    headAccessory: 'crown',
    hairStyle: 'pigtails',
  },
];

export function getAvatarPresetById(id?: string): AvatarPresetSpec {
  return AVATAR_PRESETS.find((p) => p.id === id) || AVATAR_PRESETS[0];
}

export function getEmployeeAvatarId(emp: Pick<Employee, 'id' | 'avatarPreset'>): string {
  if (emp.avatarPreset && AVATAR_PRESETS.some((p) => p.id === emp.avatarPreset)) {
    return emp.avatarPreset;
  }
  let hash = 0;
  for (let i = 0; i < emp.id.length; i += 1) {
    hash = (hash * 31 + emp.id.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PRESETS[hash % AVATAR_PRESETS.length].id;
}

interface BobbleAvatarProps {
  presetId?: string;
  photoUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  bobbleIndex?: number;
  wobblePulse?: number;
  interactive?: boolean;
}

const SIZE_MAP = {
  sm: { w: 48, h: 54 },
  md: { w: 74, h: 84 },
  lg: { w: 120, h: 136 },
} as const;

function renderChibiBody(spec: AvatarPresetSpec) {
  const ink = '#1e293b';

  if (
    spec.vehicle === 'scooter-yellow' ||
    spec.vehicle === 'scooter-mint' ||
    spec.vehicle === 'scooter-pink' ||
    spec.vehicle === 'escooter' ||
    spec.vehicle === 'sportbike'
  ) {
    return (
      <g stroke={ink} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
        {/* Cute rider arms holding handlebars */}
        <path d="M28 74 Q38 69 44 73" fill="none" stroke={spec.skin} strokeWidth="6" />
        <path d="M28 74 Q38 69 44 73" fill="none" stroke={ink} strokeWidth="2" />
        <path d="M72 74 Q62 69 56 73" fill="none" stroke={spec.skin} strokeWidth="6" />
        <path d="M72 74 Q62 69 56 73" fill="none" stroke={ink} strokeWidth="2" />

        {/* Little legs / sneakers */}
        <ellipse cx="32" cy="93" rx="6" ry="7" fill="#fb7185" />
        <ellipse cx="68" cy="93" rx="6" ry="7" fill="#fb7185" />
        <ellipse cx="32" cy="98" rx="5.5" ry="4" fill="#ffffff" />
        <ellipse cx="68" cy="98" rx="5.5" ry="4" fill="#ffffff" />

        {/* Handlebars + round mirrors (just like dashboard scooter) */}
        <line x1="25" y1="73" x2="40" y2="75" strokeWidth="3.2" />
        <line x1="75" y1="73" x2="60" y2="75" strokeWidth="3.2" />
        <line x1="28" y1="72" x2="21" y2="62" strokeWidth="2.2" />
        <line x1="72" y1="72" x2="79" y2="62" strokeWidth="2.2" />
        <circle cx="20" cy="60" r="6" fill={spec.secondary} />
        <circle cx="20" cy="60" r="2.6" fill="#94a3b8" stroke="none" />
        <circle cx="80" cy="60" r="6" fill={spec.secondary} />
        <circle cx="80" cy="60" r="2.6" fill="#94a3b8" stroke="none" />
        <rect x="20" y="70" width="9" height="6" rx="3" fill="#ffffff" />
        <rect x="71" y="70" width="9" height="6" rx="3" fill="#ffffff" />

        {/* Scooter front fairing */}
        <path
          d="M36 78 C36 69 64 69 64 78 L69 98 C69 109 31 109 31 98 Z"
          fill={spec.primary}
        />
        {/* Inner shield */}
        <path
          d="M41 79 C41 74 59 74 59 79 L62 96 C62 103 38 103 38 96 Z"
          fill={spec.secondary}
          strokeWidth="1.8"
        />
        {/* Headlight & cute smile emblem */}
        <circle cx="50" cy="79" r="5.5" fill="#ffffff" />
        <path d="M46 82 Q50 85 54 82" fill="none" stroke={ink} strokeWidth="1.6" />
        {/* Dual red turn lights */}
        <circle cx="38" cy="91" r="3.4" fill={spec.accent} />
        <circle cx="62" cy="91" r="3.4" fill={spec.accent} />
        {/* Front tire */}
        <rect x="44" y="96" width="12" height="17" rx="6" fill="#57534e" />
        <line x1="50" y1="98" x2="50" y2="111" stroke="#a8a29e" strokeWidth="1.4" />
      </g>
    );
  }

  if (spec.vehicle === 'mini-car') {
    return (
      <g stroke={ink} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
        {/* Wheels */}
        <rect x="20" y="96" width="12" height="14" rx="4" fill="#334155" />
        <rect x="68" y="96" width="12" height="14" rx="4" fill="#334155" />
        {/* Hands on wheel */}
        <circle cx="37" cy="77" r="4.5" fill={spec.skin} />
        <circle cx="63" cy="77" r="4.5" fill={spec.skin} />
        {/* Car body */}
        <path
          d="M22 86 C24 73 76 73 78 86 L82 102 C82 106 18 106 18 102 Z"
          fill={spec.primary}
        />
        {/* Windshield */}
        <path d="M31 79 Q50 72 69 79" fill="none" stroke="#bae6fd" strokeWidth="4" />
        {/* Headlights & bumper */}
        <circle cx="29" cy="92" r="5" fill="#fef08a" />
        <circle cx="71" cy="92" r="5" fill="#fef08a" />
        <rect x="39" y="92" width="22" height="8" rx="3" fill={spec.secondary} />
      </g>
    );
  }

  if (spec.vehicle === 'skateboard') {
    return (
      <g stroke={ink} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
        {/* Hoodie & outstretched arms */}
        <path d="M22 77 L38 72 L62 72 L78 77" fill="none" stroke={spec.primary} strokeWidth="7" />
        <path d="M22 77 L38 72 L62 72 L78 77" fill="none" stroke={ink} strokeWidth="2" />
        <circle cx="21" cy="77" r="4.2" fill={spec.skin} />
        <circle cx="79" cy="77" r="4.2" fill={spec.skin} />
        <rect x="37" y="70" width="26" height="23" rx="9" fill={spec.primary} />
        {/* Legs & shoes */}
        <rect x="38" y="91" width="8" height="10" rx="3" fill="#334155" />
        <rect x="54" y="91" width="8" height="10" rx="3" fill="#334155" />
        {/* Skateboard deck & wheels */}
        <rect x="20" y="100" width="60" height="8" rx="4" fill={spec.accent} />
        <circle cx="31" cy="109" r="4.2" fill={spec.secondary} />
        <circle cx="69" cy="109" r="4.2" fill={spec.secondary} />
      </g>
    );
  }

  if (spec.vehicle === 'coffee') {
    return (
      <g stroke={ink} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
        {/* Waving hands */}
        <path d="M24 73 Q32 69 36 76" fill="none" stroke={spec.skin} strokeWidth="5.5" />
        <path d="M76 73 Q68 69 64 76" fill="none" stroke={spec.skin} strokeWidth="5.5" />
        <circle cx="23" cy="73" r="4" fill={spec.skin} />
        <circle cx="77" cy="73" r="4" fill={spec.skin} />
        {/* Cup handle */}
        <path d="M68 82 C79 82 79 97 66 97" fill="none" stroke={ink} strokeWidth="3.2" />
        {/* Giant coffee mug */}
        <path d="M31 76 L69 76 L64 106 C64 109 36 109 36 106 Z" fill={spec.secondary} />
        <rect x="34" y="83" width="32" height="13" rx="3" fill={spec.primary} />
        <circle cx="50" cy="89.5" r="4" fill="#ffffff" />
      </g>
    );
  }

  // Bicycle, Rocket, Office Chair, Cloud — playful chibi vehicles
  return (
    <g stroke={ink} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
      {/* Cheerful arms */}
      <path d="M25 75 Q37 69 44 74" fill="none" stroke={spec.skin} strokeWidth="5.5" />
      <path d="M75 75 Q63 69 56 74" fill="none" stroke={spec.skin} strokeWidth="5.5" />
      <circle cx="24" cy="75" r="4" fill={spec.skin} />
      <circle cx="76" cy="75" r="4" fill={spec.skin} />
      {/* Torso */}
      <rect x="36" y="71" width="28" height="22" rx="10" fill={spec.primary} />
      <rect x="42" y="75" width="16" height="10" rx="4" fill={spec.secondary} />
      {/* Base ride */}
      {spec.vehicle === 'cloud' ? (
        <g fill="#ffffff">
          <circle cx="34" cy="98" r="10" />
          <circle cx="50" cy="95" r="12" />
          <circle cx="66" cy="98" r="10" />
          <rect x="33" y="98" width="34" height="11" rx="5" stroke="none" />
        </g>
      ) : spec.vehicle === 'rocket' ? (
        <g>
          <path d="M35 88 L65 88 L59 107 L41 107 Z" fill={spec.accent} />
          <path d="M44 107 L50 115 L56 107 Z" fill="#facc15" />
        </g>
      ) : (
        <g>
          <rect x="28" y="92" width="44" height="11" rx="5.5" fill={spec.secondary} />
          <circle cx="34" cy="106" r="5" fill={spec.accent} />
          <circle cx="66" cy="106" r="5" fill={spec.accent} />
        </g>
      )}
    </g>
  );
}

function renderHeadAccessory(spec: AvatarPresetSpec) {
  const ink = '#1e293b';
  switch (spec.headAccessory) {
    case 'goggles':
      return (
        <g stroke={ink} strokeWidth="2.1">
          <circle cx="39" cy="16" r="8.5" fill="#fce7f3" />
          <circle cx="61" cy="16" r="8.5" fill="#fce7f3" />
          <circle cx="39" cy="16" r="4.8" fill="#ffffff" strokeWidth="1.4" />
          <circle cx="61" cy="16" r="4.8" fill="#ffffff" strokeWidth="1.4" />
          <line x1="47.5" y1="16" x2="52.5" y2="16" strokeWidth="2.4" />
        </g>
      );
    case 'glasses':
      return (
        <g stroke={ink} strokeWidth="2" fill="none">
          <rect x="28" y="34" width="17" height="11" rx="4" fill="#ffffff35" />
          <rect x="55" y="34" width="17" height="11" rx="4" fill="#ffffff35" />
          <line x1="45" y1="39.5" x2="55" y2="39.5" />
        </g>
      );
    case 'bow':
      return (
        <g stroke={ink} strokeWidth="2" fill={spec.accent}>
          <path d="M50 14 L38 8 L40 19 Z" />
          <path d="M50 14 L62 8 L60 19 Z" />
          <circle cx="50" cy="14" r="3.8" fill="#ffffff" />
        </g>
      );
    case 'cap':
      return (
        <g stroke={ink} strokeWidth="2.1">
          <path d="M25 26 C27 10 73 10 75 26 Z" fill={spec.primary} />
          <path d="M23 26 Q50 21 82 27 Q62 30 23 26 Z" fill={spec.accent} />
        </g>
      );
    case 'headset':
      return (
        <g stroke={ink} strokeWidth="2.1">
          <path d="M22 39 C22 13 78 13 78 39" fill="none" stroke={spec.primary} strokeWidth="4" />
          <rect x="17" y="34" width="7" height="14" rx="3.5" fill={spec.accent} />
          <rect x="76" y="34" width="7" height="14" rx="3.5" fill={spec.accent} />
        </g>
      );
    case 'crown':
      return (
        <path
          d="M36 18 L39 7 L50 14 L61 7 L64 18 Z"
          fill="#facc15"
          stroke={ink}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      );
    default:
      return null;
  }
}

export function BobbleAvatar({
  presetId,
  photoUrl,
  size = 'lg',
  bobbleIndex = 0,
  wobblePulse = 0,
  interactive = true,
}: BobbleAvatarProps) {
  const clipId = useId();
  const headBurstRef = useRef<HTMLDivElement | null>(null);
  const bodyBurstRef = useRef<HTMLDivElement | null>(null);
  const headAnimRef = useRef<Animation | null>(null);
  const bodyAnimRef = useRef<Animation | null>(null);
  const prevPulseRef = useRef<number>(wobblePulse);

  const spec = getAvatarPresetById(presetId);
  const dims = SIZE_MAP[size];
  const durationSec = (1.15 + (bobbleIndex % 5) * 0.14).toFixed(2);
  const delaySec = (-((bobbleIndex % 7) * 0.21)).toFixed(2);
  const isEven = bobbleIndex % 2 === 0;
  const hasPhoto = Boolean(photoUrl && photoUrl.startsWith('data:image/'));

  const triggerSpringBurst = useCallback(() => {
    const headEl = headBurstRef.current;
    const bodyEl = bodyBurstRef.current;

    if (headEl && typeof headEl.animate === 'function') {
      headAnimRef.current?.cancel();
      headAnimRef.current = headEl.animate(
        [
          { transform: 'rotate(0deg) translate3d(0, 0, 0) scale(1)' },
          { transform: 'rotate(-26deg) translate3d(-6px, 4px, 0) scale(1.06)', offset: 0.08 },
          { transform: 'rotate(23deg) translate3d(5.5px, -3px, 0) scale(1.03)', offset: 0.18 },
          { transform: 'rotate(-18deg) translate3d(-4px, 2.5px, 0) scale(1.02)', offset: 0.3 },
          { transform: 'rotate(14deg) translate3d(3px, -2px, 0) scale(1.01)', offset: 0.44 },
          { transform: 'rotate(-9deg) translate3d(-2px, 1.5px, 0)', offset: 0.6 },
          { transform: 'rotate(5deg) translate3d(1px, -1px, 0)', offset: 0.76 },
          { transform: 'rotate(-2.5deg) translate3d(-0.5px, 0.5px, 0)', offset: 0.9 },
          { transform: 'rotate(0deg) translate3d(0, 0, 0) scale(1)' },
        ],
        {
          duration: 1500,
          easing: 'ease-out',
        },
      );
    }

    if (bodyEl && typeof bodyEl.animate === 'function') {
      bodyAnimRef.current?.cancel();
      bodyAnimRef.current = bodyEl.animate(
        [
          { transform: 'translate3d(0, 0, 0) scaleY(1)' },
          { transform: 'translate3d(0, 3px, 0) scaleY(0.95)', offset: 0.12 },
          { transform: 'translate3d(0, -3.5px, 0) scaleY(1.03)', offset: 0.32 },
          { transform: 'translate3d(0, 1.8px, 0) scaleY(0.98)', offset: 0.56 },
          { transform: 'translate3d(0, -1px, 0) scaleY(1.01)', offset: 0.78 },
          { transform: 'translate3d(0, 0, 0) scaleY(1)' },
        ],
        {
          duration: 950,
          easing: 'ease-out',
        },
      );
    }
  }, []);

  useEffect(() => {
    if (wobblePulse !== prevPulseRef.current) {
      prevPulseRef.current = wobblePulse;
      if (wobblePulse > 0) {
        triggerSpringBurst();
      }
    }
  }, [wobblePulse, triggerSpringBurst]);

  const swayName =
    size === 'sm'
      ? 'lm-bobble-sway-sm'
      : isEven
        ? 'lm-bobble-sway-a'
        : 'lm-bobble-sway-b';

  return (
    <div
      style={{ width: dims.w, height: dims.h }}
      onClick={interactive ? triggerSpringBurst : undefined}
      onMouseEnter={interactive ? triggerSpringBurst : undefined}
      className={`relative select-none shrink-0 ${interactive ? 'cursor-pointer' : ''}`}
    >
      {/* Clear Acrylic Standee Pedestal (stationary base) */}
      <svg
        viewBox="0 0 100 128"
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden="true"
      >
        <ellipse
          cx="50"
          cy="118"
          rx="32"
          ry="7"
          fill="#f8fafc"
          stroke="#cbd5e1"
          strokeWidth="1.8"
        />
        <ellipse cx="50" cy="116" rx="26" ry="4.5" fill="#e2e8f0" opacity="0.65" />
        <path
          d="M44 106 Q56 108 44 111 Q56 113 44 116"
          fill="none"
          stroke="#64748b"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>

      {/* Chibi Scooter / Vehicle Body with subtle spring suspension bounce */}
      <div
        ref={bodyBurstRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ transformOrigin: '50% 88%' }}
      >
        <div
          className="w-full h-full"
          style={{
            transformOrigin: '50% 88%',
            animation:
              size === 'lg'
                ? `lm-bobble-body-hum ${durationSec}s ease-in-out ${delaySec}s infinite`
                : undefined,
          }}
        >
          <svg
            viewBox="0 0 100 128"
            className="w-full h-full"
            style={{
              filter: 'drop-shadow(0 3px 6px rgba(15, 23, 42, 0.14))',
            }}
            aria-hidden="true"
          >
            <g
              style={{
                filter:
                  'drop-shadow(0 0 2.5px #ffffff) drop-shadow(0 0 2.5px #ffffff) drop-shadow(0 0 1.5px #ffffff)',
              }}
            >
              {renderChibiBody(spec)}
            </g>
          </svg>
        </div>
      </div>

      {/* Oversized Spring-Mounted Bobbing Head ("Đầu lắc lư qua lại trên lò xo") */}
      <div
        ref={headBurstRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ transformOrigin: '50% 56%' }}
      >
        <div
          className="w-full h-full"
          style={{
            transformOrigin: '50% 56%',
            animation: `${swayName} ${durationSec}s ease-in-out ${delaySec}s infinite`,
          }}
        >
          <svg
            viewBox="0 0 100 128"
            className="w-full h-full"
            style={{
              filter:
                'drop-shadow(0 0 2.5px #ffffff) drop-shadow(0 0 2.5px #ffffff) drop-shadow(0 2px 4px rgba(15,23,42,0.16))',
            }}
            aria-hidden="true"
          >
          <defs>
            <clipPath id={clipId}>
              <ellipse cx="50" cy="40" rx="24.5" ry="23.5" />
            </clipPath>
          </defs>

          {/* Coiled neck spring attached to the pivoting head so it bends smoothly */}
          <path
            d="M45 62 Q55 64 45 67 Q55 69 45 72"
            fill="none"
            stroke="#475569"
            strokeWidth="2.6"
            strokeLinecap="round"
          />

          {/* Pigtails / Back hair */}
          {spec.hairStyle === 'pigtails' && (
            <g fill={spec.hair} stroke="#1e293b" strokeWidth="2">
              <circle cx="21" cy="42" r="7.5" />
              <circle cx="79" cy="42" r="7.5" />
            </g>
          )}
          {spec.hairStyle === 'bun' && (
            <circle cx="50" cy="13" r="9.5" fill={spec.hair} stroke="#1e293b" strokeWidth="2" />
          )}
          {spec.hairStyle === 'wavy' && (
            <path
              d="M23 39 C23 14 77 14 77 39 C80 51 75 61 68 62 L32 62 C25 61 20 51 23 39 Z"
              fill={spec.hair}
              stroke="#1e293b"
              strokeWidth="2"
            />
          )}

          {/* Ears */}
          <circle cx="24.5" cy="42" r="5" fill={spec.skin} stroke="#1e293b" strokeWidth="2" />
          <circle cx="75.5" cy="42" r="5" fill={spec.skin} stroke="#1e293b" strokeWidth="2" />

          {/* Oversized Round Chibi Head */}
          <ellipse
            cx="50"
            cy="40"
            rx="25.5"
            ry="24.5"
            fill={spec.skin}
            stroke="#ffffff"
            strokeWidth="3.5"
          />

          {hasPhoto ? (
            <>
              <image
                href={photoUrl}
                x="24.5"
                y="15.5"
                width="51"
                height="49"
                preserveAspectRatio="xMidYMid slice"
                clipPath={`url(#${clipId})`}
              />
              <ellipse
                cx="50"
                cy="40"
                rx="24.8"
                ry="23.8"
                fill="none"
                stroke="#1e293b"
                strokeWidth="2"
              />
            </>
          ) : (
            <>
              {/* Cartoon Chibi Face */}
              <ellipse
                cx="50"
                cy="40"
                rx="24.8"
                ry="23.8"
                fill={spec.skin}
                stroke="#1e293b"
                strokeWidth="2"
              />
              {/* Hair bangs */}
              <path
                d="M26 35 C27 16 73 16 74 35 C65 25 56 26 50 30 C44 26 35 25 26 35 Z"
                fill={spec.hair}
                stroke="#1e293b"
                strokeWidth="1.8"
              />
              {/* Big sparkly chibi eyes */}
              <circle cx="39.5" cy="42" r="3.4" fill="#1e293b" />
              <circle cx="60.5" cy="42" r="3.4" fill="#1e293b" />
              <circle cx="40.6" cy="40.8" r="1.2" fill="#ffffff" />
              <circle cx="61.6" cy="40.8" r="1.2" fill="#ffffff" />
              {/* Rosy cheeks */}
              <ellipse cx="32.5" cy="48.5" rx="4.5" ry="2.6" fill="#fb7185" opacity="0.5" />
              <ellipse cx="67.5" cy="48.5" rx="4.5" ry="2.6" fill="#fb7185" opacity="0.5" />
              {/* Cute pouty/happy mouth */}
              <ellipse cx="50" cy="52" rx="3.4" ry="2.5" fill="#ef4444" />
            </>
          )}

          {/* Cute top goggles / glasses / bow / cap */}
          {renderHeadAccessory(spec)}
        </svg>
        </div>
      </div>
    </div>
  );
}
