import { useMemo, useState } from 'react';
import { validateSlotPayload } from './validateSlotPayload';
import {
  buildLookupMaps,
  getSlotDisplayLabels,
  formatSlotToastText,
} from './resolveSlotLabels';

export function useBatchTimetableSubmit({
  subjects = [],
  teachers = [],
  buildSlotPayload,
  submitSlot, // async (cleanedPayload) => api.post('/timetable', cleanedPayload)
  showToast,
  onSuccessRefresh,
}) {
  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    validItems: [],
    invalidItems: [],
  });

  const { subjectMap, teacherMap } = useMemo(
    () => buildLookupMaps(subjects, teachers),
    [subjects, teachers]
  );

  // Step 1: Validate all targets and open confirmation modal
  const prepareBatchSubmit = (targets = []) => {
    const validItems = [];
    const invalidItems = [];

    for (const target of targets) {
      const rawPayload = buildSlotPayload(target);
      const check = validateSlotPayload(rawPayload);
      const { subjectName, teacherName } = getSlotDisplayLabels(
        rawPayload,
        subjectMap,
        teacherMap
      );

      if (!check.valid) {
        invalidItems.push({
          label: target.label,
          subjectName,
          teacherName,
          reason: check.reason,
          payload: rawPayload,
        });
      } else {
        validItems.push({
          label: target.label,
          subjectName,
          teacherName,
          payload: check.cleanedPayload,
        });
      }
    }

    setConfirmState({
      isOpen: true,
      validItems,
      invalidItems,
    });
  };

  // Step 2: Submit confirmed slots and show toast with subject & teacher names
  const confirmBatchSubmit = async () => {
    const { validItems, invalidItems } = confirmState;
    setConfirmState((prev) => ({ ...prev, isOpen: false }));

    const succeeded = [];
    const apiErrors = [];

    for (const item of validItems) {
      try {
        await submitSlot(item.payload);
        succeeded.push(item);
      } catch (err) {
        apiErrors.push({
          label: item.label,
          subjectName: item.subjectName,
          teacherName: item.teacherName,
          message: err?.message || 'Request failed',
        });
      }
    }

    const skippedEntries = invalidItems.map(
      (inv) => `${formatSlotToastText(inv)}: ${inv.reason}`
    );

    const apiErrorEntries = apiErrors.map(
      (err) => `${formatSlotToastText(err)}: ${err.message}`
    );

    const allFailures = [...skippedEntries, ...apiErrorEntries];

    if (allFailures.length === 0) {
      const submittedPreview = succeeded
        .slice(0, 2)
        .map((s) => formatSlotToastText(s))
        .join(', ');
      const moreSubmitted = succeeded.length > 2 ? ` (+${succeeded.length - 2} more)` : '';

      showToast(
        `Submitted ${succeeded.length} slot(s): ${submittedPreview}${moreSubmitted}`,
        'success'
      );
    } else {
      const preview = allFailures.slice(0, 2).join(' | ');
      const moreFailed =
        allFailures.length > 2 ? ` (+${allFailures.length - 2} more — see console)` : '';

      if (allFailures.length > 2) {
        console.warn('[Batch Copy Toast Overflow Details]', allFailures);
      }

      showToast(
        `Submitted ${succeeded.length}, ${allFailures.length} skipped/failed — ${preview}${moreFailed}`,
        succeeded.length > 0 ? 'warning' : 'error'
      );
    }

    if (succeeded.length > 0 && typeof onSuccessRefresh === 'function') {
      await onSuccessRefresh();
    }
  };

  const cancelBatchSubmit = () => {
    setConfirmState((prev) => ({ ...prev, isOpen: false }));
  };

  return {
    confirmState,
    prepareBatchSubmit,
    confirmBatchSubmit,
    cancelBatchSubmit,
  };
}
