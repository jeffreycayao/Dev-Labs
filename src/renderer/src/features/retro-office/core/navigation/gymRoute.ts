import type { FacingPoint, GymRoute } from "@/features/retro-office/core/types";
import {
  EAST_ROOM_END_X,
  EAST_ROOM_X,
  GYM_BOTTOM_Y,
  GYM_DOOR_Y,
  GYM_TOP_Y,
} from "@/features/retro-office/core/constants";

// The gym's door is on its west wall, so agents walk in heading east.
export const GYM_DEFAULT_TARGET = {
  x: EAST_ROOM_X + 60,
  y: GYM_DOOR_Y + 40,
  facing: Math.PI / 2,
};

const GYM_DOOR_OUTER_TARGET = {
  x: EAST_ROOM_X - 40,
  y: GYM_DOOR_Y,
  facing: Math.PI / 2,
};

const GYM_DOOR_INNER_TARGET = {
  x: EAST_ROOM_X + 50,
  y: GYM_DOOR_Y,
  facing: Math.PI / 2,
};

const DOOR_APPROACH_RADIUS = 60;
const DOOR_INNER_SNAP_RADIUS = 18;

export const resolveGymRoute = (
  x: number,
  y: number,
  workoutTarget: FacingPoint = GYM_DEFAULT_TARGET,
): GymRoute => {
  const insideGym =
    (x >= EAST_ROOM_X && x <= EAST_ROOM_END_X &&
      y >= GYM_TOP_Y &&
      y <= GYM_BOTTOM_Y) ||
    Math.hypot(
      x - GYM_DOOR_INNER_TARGET.x,
      y - GYM_DOOR_INNER_TARGET.y,
    ) < DOOR_INNER_SNAP_RADIUS;
  if (insideGym) {
    return {
      stage: "workout",
      targetX: workoutTarget.x,
      targetY: workoutTarget.y,
      facing: workoutTarget.facing,
    };
  }

  const withinDoorThreshold =
    Math.hypot(
      x - GYM_DOOR_OUTER_TARGET.x,
      y - GYM_DOOR_OUTER_TARGET.y,
    ) < DOOR_APPROACH_RADIUS;
  if (withinDoorThreshold) {
    return {
      stage: "door_inner",
      targetX: GYM_DOOR_INNER_TARGET.x,
      targetY: GYM_DOOR_INNER_TARGET.y,
      facing: GYM_DOOR_INNER_TARGET.facing,
    };
  }

  return {
    stage: "door_outer",
    targetX: GYM_DOOR_OUTER_TARGET.x,
    targetY: GYM_DOOR_OUTER_TARGET.y,
    facing: GYM_DOOR_OUTER_TARGET.facing,
  };
};
