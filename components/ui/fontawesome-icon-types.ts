export type FontAwesomeSnapshotDefinition = {
  prefix: string;
  iconName: string;
  icon: readonly [
    width: number,
    height: number,
    ligatures: readonly (string | number)[],
    unicode: string,
    svgPathData: string | readonly string[]
  ];
};
