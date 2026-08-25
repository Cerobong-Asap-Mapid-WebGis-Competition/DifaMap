'use client';

import React from 'react';
import ReactECharts from 'echarts-for-react';

interface AccessibilityRadarChartProps {
  locationName: string;
  physicalScore: number; // 1.0 - 5.0
  safetyScore: number; // 1.0 - 5.0
  rampScore: number; // 1.0 - 5.0
  guidingBlockScore: number; // 1.0 - 5.0
  lightingScore: number; // 1.0 - 5.0
  transitScore: number; // 1.0 - 5.0
}

export default function AccessibilityRadarChart({
  locationName,
  physicalScore = 4.5,
  safetyScore = 4.2,
  rampScore = 4.8,
  guidingBlockScore = 4.0,
  lightingScore = 4.5,
  transitScore = 4.7,
}: AccessibilityRadarChartProps) {
  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      borderColor: '#38bdf8',
      textStyle: { color: '#f8fafc', fontSize: 12 },
    },
    radar: {
      indicator: [
        { name: 'Ramp Kursi Roda', max: 5 },
        { name: 'Guiding Block', max: 5 },
        { name: 'Permukaan Trotoar', max: 5 },
        { name: 'Pencahayaan', max: 5 },
        { name: 'Koneksi Transit', max: 5 },
        { name: 'Keamanan Lingkungan', max: 5 },
      ],
      shape: 'polygon',
      splitNumber: 4,
      axisName: {
        color: '#94a3b8',
        fontSize: 11,
        fontWeight: 'bold',
      },
      splitLine: {
        lineStyle: {
          color: ['rgba(56, 189, 248, 0.1)', 'rgba(56, 189, 248, 0.2)', 'rgba(56, 189, 248, 0.3)', 'rgba(56, 189, 248, 0.4)'],
        },
      },
      splitArea: {
        show: true,
        areaStyle: {
          color: ['rgba(15, 23, 42, 0.4)', 'rgba(30, 41, 59, 0.4)'],
        },
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(56, 189, 248, 0.3)',
        },
      },
    },
    series: [
      {
        name: `Indeks Aksesibilitas: ${locationName}`,
        type: 'radar',
        data: [
          {
            value: [rampScore, guidingBlockScore, physicalScore, lightingScore, transitScore, safetyScore],
            name: locationName,
            symbol: 'circle',
            symbolSize: 6,
            itemStyle: {
              color: '#38bdf8',
              borderColor: '#0284c7',
              borderWidth: 2,
            },
            lineStyle: {
              width: 2.5,
              color: '#38bdf8',
              shadowColor: 'rgba(56, 189, 248, 0.6)',
              shadowBlur: 10,
            },
            areaStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 1,
                y2: 1,
                colorStops: [
                  { offset: 0, color: 'rgba(56, 189, 248, 0.5)' },
                  { offset: 1, color: 'rgba(168, 85, 247, 0.2)' },
                ],
              },
            },
          },
        ],
      },
    ],
  };

  return (
    <div style={{ width: '100%', height: '240px' }}>
      <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
    </div>
  );
}
