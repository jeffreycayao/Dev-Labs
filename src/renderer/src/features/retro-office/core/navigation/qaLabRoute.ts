import type { FacingPoint, QaLabRoute } from "@/features/retro-office/core/types";
import {
  EAST_ROOM_END_X,
  EAST_ROOM_X,
  QA_BOTTOM_Y,
  QA_DOOR_Y,
  QA_TOP_Y,
} from "@/features/retro-office/core/constants";

// The QA lab's door is on its west wall, so agents walk in heading east.
export const QA_LAB_DEFAULT_TARGET = {
  x: EAST_ROOM_X + 60,
  y: QA_DOOR_Y - 40,
  facing: Math.PI / 2,
};

const QA_LAB_DOOR_OUTER_TARGET = {
  x: EAST_ROOM_X - 40,
  y: QA_DOOR_Y,
  facing: Math.PI / 2,
};

const QA_LAB_DOOR_INNER_TARGET = {
  x: EAST_ROOM_X + 50,
  y: QA_DOOR_Y,
  facing: Math.PI / 2,
};

const DOOR_APPROACH_RADIUS = 60;
const DOOR_INNER_SNAP_RADIUS = 18;

export const resolveQaLabRoute = (
  x: number,
  y: number,
  stationTarget: FacingPoint = QA_LAB_DEFAULT_TARGET,
): QaLabRoute => {
  const insideLab =
    (x >= EAST_ROOM_X && x <= EAST_ROOM_END_X &&
      y >= QA_TOP_Y &&
      y <= QA_BOTTOM_Y) ||
    Math.hypot(
      x - QA_LAB_DOOR_INNER_TARGET.x,
      y - QA_LAB_DOOR_INNER_TARGET.y,
    ) < DOOR_INNER_SNAP_RADIUS;
  if (insideLab) {
    return {
      stage: "station",
      targetX: stationTarget.x,
      targetY: stationTarget.y,
      facing: stationTarget.facing,
    };
  }

  const withinDoorThreshold =
    Math.hypot(
      x - QA_LAB_DOOR_OUTER_TARGET.x,
      y - QA_LAB_DOOR_OUTER_TARGET.y,
    ) < DOOR_APPROACH_RADIUS;
  if (withinDoorThreshold) {
    return {
      stage: "door_inner",
      targetX: QA_LAB_DOOR_INNER_TARGET.x,
      targetY: QA_LAB_DOOR_INNER_TARGET.y,
      facing: QA_LAB_DOOR_INNER_TARGET.facing,
    };
  }

  return {
    stage: "door_outer",
    targetX: QA_LAB_DOOR_OUTER_TARGET.x,
    targetY: QA_LAB_DOOR_OUTER_TARGET.y,
    facing: QA_LAB_DOOR_OUTER_TARGET.facing,
  };
};
