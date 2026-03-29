const exampleLevel = `
#########################
# b                   t #
#             # b       #
#           @ #         #
#             #   t     #
#  b                    #
#########################`.trim();

const EntityType = {
  Player: "player",
  Wall: "wall",
  Burger: "burger",
  Toilet: "toilet",
  Glass: "glass",
  None: "none",
} as const;

type EntityType = (typeof EntityType)[keyof typeof EntityType];

type ParsedEntity = {
  entity: EntityType;
  x: number;
  y: number;
  flipX?: boolean;
};

const entityByChar: Record<string, Omit<ParsedEntity, "x" | "y">> = {
  "@": { entity: "player" },
  "#": { entity: "wall" },
  b: { entity: "burger" },
  t: { entity: "toilet", flipX: false },
  T: { entity: "toilet", flipX: true },
  g: { entity: "glass" },
};

export function parseLevel(level: string) {
  const entities: ParsedEntity[] = [];
  const lines = level.split("\n");
  for (const [y, line] of lines.entries()) {
    for (const [x, char] of line.split("").entries()) {
      const parsed = entityByChar[char];
      if (parsed) {
        entities.push({ ...parsed, x, y });
      }
    }
  }
  return {
    level: {
      height: lines.length,
      width: lines[0]!.length,
    },
    entities,
  };
}

console.log(parseLevel(exampleLevel));
