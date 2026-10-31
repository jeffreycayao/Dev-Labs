export const DESK_STICKY_MS = 10_000;
export const SNAP_GRID = 10;
export const STORAGE_KEY = "openclaw-office-furniture-v9";
export const ATM_MIGRATION_KEY = "openclaw-office-atm-migration-v1";
export const SERVER_ROOM_MIGRATION_KEY =
  "openclaw-office-server-room-migration-v3";
export const GYM_ROOM_MIGRATION_KEY = "openclaw-office-gym-room-migration-v3";
export const QA_LAB_MIGRATION_KEY = "openclaw-office-qa-lab-migration-v3";
export const CAFETERIA_MIGRATION_KEY = "devlabs-office-cafeteria-migration-v1";
export const PHONE_BOOTH_MIGRATION_KEY = "openclaw-office-phone-booth-migration-v1";
export const SMS_BOOTH_MIGRATION_KEY = "openclaw-office-sms-booth-migration-v1";
export const ROTATION_STEP_DEG = 15;
export const WALL_THICKNESS = 8;
export const DOOR_THICKNESS = 8;
export const DOOR_LENGTH = 40;
export const MIN_WALL_LENGTH = SNAP_GRID * 2;
export const ELEVATION_STEP = 0.08;
export const WALK_SPEED = 0.3;
export const WORKING_WALK_SPEED_MULTIPLIER = 3;
export const WALK_ANIM_SPEED = 0.15;
export const AGENT_SCALE = 1.75;
export const BUMP_FREEZE_MS = 1500;
export const BUMP_RECOVERY_MS = 1200;
export const AGENT_RADIUS = 20;
export const SEPARATION_STRENGTH = 3;
export const CANVAS_W = 1800;
export const CANVAS_H = 1800;
export const EAST_WING_START_X = 1092;
export const EAST_WING_SIDE_MARGIN = 34;
export const EAST_WING_ROOM_TOP_Y = 40;
export const EAST_WING_ROOM_HEIGHT = 640;
export const EAST_HALL_WIDTH = 56;
export const EAST_WING_SPECIALTY_ROOM_WIDTH = 176;
export const GYM_ROOM_X = EAST_WING_START_X + EAST_WING_SIDE_MARGIN;
export const GYM_ROOM_WIDTH = EAST_WING_SPECIALTY_ROOM_WIDTH;
export const GYM_ROOM_END_X = GYM_ROOM_X + GYM_ROOM_WIDTH;
export const QA_LAB_X = GYM_ROOM_END_X + EAST_HALL_WIDTH;
export const QA_LAB_WIDTH = EAST_WING_SPECIALTY_ROOM_WIDTH;
export const QA_LAB_END_X = QA_LAB_X + QA_LAB_WIDTH;
// Before v4.2.2 the gym and QA lab stood side by side in this east wing. The
// EAST_WING_*, GYM_ROOM_* and QA_LAB_* values above still describe that layout,
// so saved floors can be recognised and migrated (furnitureDefaults.ts).
// Since v4.2.2 both rooms are stacked in the east strip, doors facing west, and
// a cafeteria (kapihan) fills the space they left.
export const EAST_ROOM_X = 1550;
export const EAST_ROOM_END_X = 1792;
export const EAST_ROOM_WIDTH = EAST_ROOM_END_X - EAST_ROOM_X;
export const GYM_TOP_Y = 40;
export const GYM_BOTTOM_Y = 390;
/** Centre of the gym door gap (175–225: two whole 25-unit nav rows). */
export const GYM_DOOR_Y = 200;
export const QA_TOP_Y = 390;
export const QA_BOTTOM_Y = 680;
/** Centre of the QA lab door gap (500–550). */
export const QA_DOOR_Y = 525;
export const CAFETERIA_X = 1140;
export const CAFETERIA_END_X = 1540;
export const EAST_WING_DOOR_Y = 260;
export const SCALE = 0.018;
export const WORLD_W = CANVAS_W * SCALE;
export const WORLD_H = CANVAS_H * SCALE;
export const PING_PONG_SESSION_MS = 60_000;
export const PING_PONG_APPROACH_SPEED = WALK_SPEED * 1.8;
export const PING_PONG_BALL_RADIUS = 0.055;
export const PING_PONG_TABLE_SURFACE_Y = 0.465;
