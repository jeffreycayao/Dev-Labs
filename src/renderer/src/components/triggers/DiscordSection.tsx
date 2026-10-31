import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parseChannelIds } from '@shared/discord';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';
import { Callout, Field, Hint, MiniButton, Toggle, textareaStyle } from './ui';

type Status = Awaited<ReturnType<typeof window.cth.discordStatus>>;

/**
 * DISCORD — an @-mention of the user's bot in a watched channel queues work for
 * Ramon, like Slack. The bot token is the Discord connector's key (Settings →
 * Connections); this card only holds which channels to watch and the on switch.
 * Main does the watching and the "Received" reply; nothing here sees the token.
 */
export function DiscordSection({ onSummary }: { onSummary?: (s: string) => void }) {
  const { t } = useTranslation();
  const godName = useResolvedGodName();
  const [enabled, setEnabled] = useState(false);
  const [channels, setChannels] = useState('');
  const [users, setUsers] = useState('');
  const [hasKey, setHasKey] = useState(true);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.cth.discordGetTrigger().then((c) => {
      setEnabled(c.enabled);
      setChannels(c.channelIds.join('\n'));
      setUsers(c.allowedUserIds.join('\n'));
    });
    void window.cth.discordStatus().then(setStatus);
    void window.cth.mcpSecretStatus?.().then((k) => setHasKey(!!k.discord)).catch(() => { /* older main */ });
  }, []);

  useEffect(() => {
    onSummary?.(!hasKey ? t('discordSection.noToken') : status?.running ? t('common.on') : t('common.off'));
  }, [hasKey, status, onSummary, t]);

  const ids = parseChannelIds(channels);
  const userIds = parseChannelIds(users);
  const apply = async (nextEnabled: boolean) => {
    setBusy(true);
    try {
      setStatus(await window.cth.discordSetTrigger({ enabled: nextEnabled, channelIds: ids, allowedUserIds: userIds }));
      setEnabled(nextEnabled);
      setChannels(ids.join('\n'));
      setUsers(userIds.join('\n'));
    } finally { setBusy(false); }
  };

  const channelErrors = Object.entries(status?.channelErrors ?? {});

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--cth-ink-700)' }}>{t('discordSection.listen')}</span>
        <Toggle on={enabled} onClick={() => { if (!busy) void apply(!enabled); }} />
      </div>

      <Field label={t('discordSection.channels')}>
        <textarea
          rows={3}
          value={channels}
          spellCheck={false}
          placeholder={t('discordSection.channelsPlaceholder')}
          onChange={(e) => setChannels(e.target.value)}
          style={textareaStyle}
        />
        <Hint>{t('discordSection.channelsHint')}</Hint>
      </Field>

      <Field label={t('discordSection.users')}>
        <textarea
          rows={2}
          value={users}
          spellCheck={false}
          placeholder={t('discordSection.usersPlaceholder')}
          onChange={(e) => setUsers(e.target.value)}
          style={textareaStyle}
        />
        <Hint>{t('discordSection.usersHint')}</Hint>
        <div style={{ marginTop: 6 }}>
          <MiniButton disabled={busy} onClick={() => { void apply(enabled); }}>{t('discordSection.save')}</MiniButton>
        </div>
      </Field>

      <Callout tone="note">{t('discordSection.howItWorks', { godName })}</Callout>

      {!hasKey && <Callout>{t('discordSection.noTokenWarning')}</Callout>}
      {status?.running && (
        <Hint>{t('discordSection.listening', { name: status.botName ?? '', users: status.allowedUserIds.join(', ') })}</Hint>
      )}
      {enabled && status?.error && <Callout>{status.error}</Callout>}
      {channelErrors.map(([id, error]) => (
        <Callout key={id}>{t('discordSection.channelError', { id, error })}</Callout>
      ))}
    </>
  );
}
