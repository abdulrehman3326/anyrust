import type { QualityKey, QualityPreset } from '../model/types';

export const qualityPresets: Record<QualityKey, QualityPreset> = {
  balanced: { label: 'Balanced · 1080p / 30 fps', width: 1920, height: 1080, fps: 30, bitrate: 4_000_000 },
  motion: { label: 'Motion · 720p / 60 fps', width: 1280, height: 720, fps: 60, bitrate: 5_000_000 },
  detail: { label: 'Detail · 1440p / 30 fps', width: 2560, height: 1440, fps: 30, bitrate: 7_000_000 },
};

export const qualityKeys = Object.keys(qualityPresets) as QualityKey[];
