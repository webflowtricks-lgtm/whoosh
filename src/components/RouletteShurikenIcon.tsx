import React from 'react';

interface RouletteShurikenIconProps {
  idPrefix: string;
  tone: 'silver' | 'gold';
}

const SHURIKEN_PATH = `
  M1093 33
  C1081 156 1006 248 888 289
  C855 390 757 432 679 397
  C627 374 609 318 610 228
  C480 95 260 50 69 155
  C200 150 296 240 328 359
  C425 400 461 478 423 551
  C390 607 330 630 267 638
  C155 750 94 960 198 1190
  C201 1060 278 970 399 930
  C430 832 510 790 584 824
  C646 852 675 911 676 977
  C800 1110 1020 1140 1222 1055
  C1090 1050 1000 960 963 847
  C865 810 827 730 856 655
  C884 590 944 562 1058 551
  C1170 420 1180 210 1093 33Z
`;

export default function RouletteShurikenIcon({ idPrefix, tone }: RouletteShurikenIconProps) {
  const shapeId = `${idPrefix}-shape`;
  const clipId = `${idPrefix}-clip`;
  const edgeId = `${idPrefix}-edge`;
  const bodyId = `${idPrefix}-body`;
  const highlightId = `${idPrefix}-highlight`;
  const sideId = `${idPrefix}-side`;
  const centerId = `${idPrefix}-center`;
  const colors = tone === 'gold'
    ? {
      edge: ['#fff7c2', '#c18a1c', '#f6d45f', '#86520b', '#fff0a1', '#d6a52d', '#563507'],
      body: ['#f7df83', '#aa7417', '#523208', '#eac24d', '#82520b', '#d4a539', '#302006'],
      side: ['#fff0a1', '#bc851a', '#513309'],
      center: ['#79550f', '#342204', '#edcc60'],
      highlight: '#fff5c2',
      outline: '#ffe89b',
    }
    : {
      edge: ['#ffffff', '#cbd3df', '#596270', '#f1f4f8', '#8d97a6', '#e5e9f0', '#454c59'],
      body: ['#f1f3f6', '#9ca5b2', '#343b46', '#d2d8e0', '#626c79', '#b5beca', '#292e37'],
      side: ['#f5f7fb', '#9da6b4', '#3b424d'],
      center: ['#626b79', '#222832', '#cbd3df'],
      highlight: '#ffffff',
      outline: '#edf2fa',
    };

  return (
    <svg
      x="18"
      y="12"
      width="74"
      height="74"
      viewBox="0 0 1240 1240"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={edgeId} x1="0" y1="0" x2=".8" y2="1">
          {colors.edge.map((color, index) => (
            <stop key={color} offset={`${index / (colors.edge.length - 1) * 100}%`} stopColor={color} />
          ))}
        </linearGradient>
        <linearGradient id={bodyId} x1="0" y1="0" x2=".9" y2="1">
          {colors.body.map((color, index) => (
            <stop key={color} offset={`${index / (colors.body.length - 1) * 100}%`} stopColor={color} />
          ))}
        </linearGradient>
        <linearGradient id={highlightId} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor={colors.highlight} stopOpacity=".65" />
          <stop offset=".18" stopColor={colors.highlight} stopOpacity=".18" />
          <stop offset=".55" stopColor={colors.highlight} stopOpacity="0" />
          <stop offset="1" stopColor={colors.highlight} stopOpacity=".17" />
        </linearGradient>
        <linearGradient id={sideId} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor={colors.side[0]} />
          <stop offset=".25" stopColor={colors.side[1]} />
          <stop offset="1" stopColor={colors.side[2]} />
        </linearGradient>
        <radialGradient id={centerId}>
          <stop offset=".55" stopColor={colors.center[0]} />
          <stop offset=".8" stopColor={colors.center[1]} />
          <stop offset="1" stopColor={colors.center[2]} />
        </radialGradient>
        <clipPath id={clipId}>
          <path id={shapeId} d={SHURIKEN_PATH} />
        </clipPath>
      </defs>
      <g className="roulette-shuriken">
        <path d={SHURIKEN_PATH} fill={`url(#${edgeId})`} stroke={colors.outline} strokeWidth="2" />
        <path d={SHURIKEN_PATH} fill={`url(#${bodyId})`} transform="translate(0 5) scale(.999)" />
        <g clipPath={`url(#${clipId})`}>
          <path d="M20 0 L650 0 L370 620 L0 500Z" fill={`url(#${highlightId})`} opacity=".55" />
          <path d="M950 0 L1240 0 L1240 570 L1050 600Z" fill={colors.highlight} opacity=".055" />
          <path d="M70 154 Q230 120 328 359" fill="none" stroke={colors.outline} strokeWidth="7" opacity=".3" />
          <path d="M1093 33 Q1080 180 888 289" fill="none" stroke={colors.outline} strokeWidth="7" opacity=".42" />
          <path d="M198 1190 Q195 1030 399 930" fill="none" stroke={colors.outline} strokeWidth="6" opacity=".35" />
          <path d="M1222 1055 Q1040 1120 963 847" fill="none" stroke={colors.outline} strokeWidth="5" opacity=".28" />
        </g>
        <path d={SHURIKEN_PATH} fill="none" stroke={colors.outline} strokeWidth="2" opacity=".4" />
        <circle cx="645" cy="603" r="116" fill="#08070b" stroke={colors.edge[2]} strokeWidth="5" />
        <circle cx="645" cy="603" r="107" fill={`url(#${sideId})`} stroke={colors.edge[1]} strokeWidth="2" />
        <circle cx="645" cy="603" r="92" fill={`url(#${centerId})`} stroke={colors.edge[2]} strokeWidth="4" />
        <circle cx="645" cy="603" r="78" fill={tone === 'gold' ? '#171107' : '#030305'} />
        <circle cx="645" cy="603" r="74" fill="none" stroke="#000" strokeWidth="3" />
        <path
          d="M555 557 A100 100 0 0 1 639 503"
          fill="none"
          stroke={colors.highlight}
          strokeWidth="5"
          opacity=".48"
          strokeLinecap="round"
        />
        <path
          d="M731 646 A94 94 0 0 1 672 700"
          fill="none"
          stroke={colors.edge[4]}
          strokeWidth="5"
          opacity=".8"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
