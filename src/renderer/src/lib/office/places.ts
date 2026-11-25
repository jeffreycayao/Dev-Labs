export const OFFICE_INTERACTION_TARGETS = [
  "desk",
  "server_room",
  "meeting_room",
  "gym",
  "jukebox",
  "qa_lab",
  "sms_booth",
  "phone_booth",
] as const;

export type OfficeInteractionTargetId =
  (typeof OFFICE_INTERACTION_TARGETS)[number];

