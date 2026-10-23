const cron = require('node-cron');
const McqModel = require('../models/mcqModel');
const logger = require('../utils/logger');

async function tick() {
  const nowIso = new Date().toISOString();
  try {
    // FIX: atomic open — one UPDATE sets is_published=1 AND schedule_state='open'.
    // Previously two separate writes: a crash between them left the row in
    // {is_published=1, schedule_state='scheduled'}, which findExamsToOpen
    // (requires is_published=0) would never retry → orphaned forever.
    const toOpen = await McqModel.findExamsToOpen(nowIso);
    for (const e of toOpen) {
      await McqModel.openExam(e.id);
      logger.audit(`MCQ auto-open: exam=${e.id} at=${nowIso}`);
    }

    // FIX: atomic close — same reason.
    const toClose = await McqModel.findExamsToClose(nowIso);
    for (const e of toClose) {
      await McqModel.closeExam(e.id);
      logger.audit(`MCQ auto-close: exam=${e.id} at=${nowIso}`);
    }

    if (toOpen.length || toClose.length) {
      logger.info(`MCQ scheduler: opened=${toOpen.length} closed=${toClose.length}`);
    }
  } catch (e) {
    logger.error('MCQ scheduler tick failed', e);
  }
}

function startMcqScheduler() {
  // FIX: guard against overlapping ticks. If a tick is slow (DB lock, network)
  // and the next one fires, you get two concurrent openers on the same rows.
  // openExam/closeExam are idempotent, so this isn't fatal — but it wastes
  // work and can double-log. A simple boolean flag is enough.
  cron.schedule('*/30 * * * * *', async () => {
    if (tick._running) {
      logger.warn('MCQ scheduler: previous tick still running, skipping');
      return;
    }
    tick._running = true;
    try {
      await tick();
    } finally {
      tick._running = false;
    }
  });
  logger.info('MCQ scheduler started (every 30s)');
  // FIX: fire the first tick via the same guard, not directly, so a slow
  // startup tick doesn't collide with the first cron invocation.
  tick._running = true;
  tick().finally(() => { tick._running = false; });
}

module.exports = { startMcqScheduler, tick };
