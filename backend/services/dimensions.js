// Single source of truth for aspect-ratio → pixel dimensions.
// FLUX.1-schnell works best around the 512–896 range; the video is the
// standard short-form 1080-class output that Remotion renders to.

const PRESETS = {
    '9:16': { fluxWidth: 512, fluxHeight: 896, videoWidth: 1080, videoHeight: 1920 },
    '16:9': { fluxWidth: 896, fluxHeight: 512, videoWidth: 1920, videoHeight: 1080 },
};

export const DEFAULT_ASPECT = '9:16';

/**
 * Resolve an aspect-ratio key to concrete FLUX + video dimensions.
 * Falls back to vertical 9:16 for any unknown value.
 */
export function resolveDimensions(aspectRatio) {
    return PRESETS[aspectRatio] || PRESETS[DEFAULT_ASPECT];
}
