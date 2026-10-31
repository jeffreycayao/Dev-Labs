// troika-three-text ships no types; only the config call OfficeFloor3D makes.
declare module 'troika-three-text' {
  export function configureTextBuilder(config: { useWorker?: boolean; defaultFontURL?: string | null }): void;
}
