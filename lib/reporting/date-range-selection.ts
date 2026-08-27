export type DateRangeSelectionState = {
  startDate: string;
  endDate: string | null;
  selectionStart: string | null;
};

export function selectDateRangeDay(
  state: DateRangeSelectionState,
  clickedDate: string,
): DateRangeSelectionState {
  if (!state.selectionStart || clickedDate < state.selectionStart) {
    return {
      startDate: clickedDate,
      endDate: null,
      selectionStart: clickedDate,
    };
  }

  return {
    startDate: state.selectionStart,
    endDate: clickedDate,
    selectionStart: null,
  };
}
