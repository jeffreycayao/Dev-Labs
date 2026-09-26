import { Config } from '@remotion/cli/config';

// Pixel-art: keep edges crisp, no smoothing on scale.
Config.setOverwriteOutput(true);
Config.setVideoImageFormat('png');
// Transparent-friendly + small files for web autoplay loops.
Config.setCodec('vp8');
