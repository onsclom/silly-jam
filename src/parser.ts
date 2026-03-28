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
  None: "none",
} as const;

type EntityType = (typeof EntityType)[keyof typeof EntityType];

const entityByChar: Record<string, EntityType> = {
  "@": "player",
  "#": "wall",
  b: "burger",
  t: "toilet",
};

export function parseLevel(level: string) {
  const entities = [];
  const lines = level.split("\n");
  for (const [y, line] of lines.entries()) {
    for (const [x, char] of line.split("").entries()) {
      const entity = entityByChar[char];
      if (entity) {
        entities.push({ entity, x, y });
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
