import React, { useCallback, useContext, useMemo, useRef } from 'react';
import { FixedSizeList as List } from 'react-window';
import { MasterLibraryContext } from '../contexts/MasterLibraryContext';

const ITEM_HEIGHT = 44;
const MAX_HEIGHT = 480;

export default function MasterLibraryResults() {
  const { items, count, page, setPage, limit, isLoading, error } = useContext(MasterLibraryContext);
  const hasResults = items.length > 0;
  const fromDisplay = count > 0 ? page * limit + 1 : 0;
  const toDisplay = count > 0 ? Math.min(count, (page + 1) * limit) : 0;

  const itemData = useMemo(() => items, [items]);
  const listHeight = Math.min(MAX_HEIGHT, Math.max(itemData.length, 1) * ITEM_HEIGHT);
  const listRef = useRef(null);
  const outerRef = useRef(null);
  const statusMessage = count ? `${fromDisplay}–${toDisplay} of ${count}` : '0 templates';
  const hiddenStyles = useMemo(
    () => ({
      border: 0,
      clip: 'rect(0 0 0 0)',
      height: '1px',
      margin: '-1px',
      overflow: 'hidden',
      padding: 0,
      position: 'absolute',
      width: '1px'
    }),
    []
  );

  const handleKeyDown = useCallback(
    (event, index) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = Math.min(Math.max(index + delta, 0), itemData.length - 1);
        if (nextIndex !== index) {
          listRef.current?.scrollToItem(nextIndex);
          requestAnimationFrame(() => {
            const container = outerRef.current;
            const target = container?.querySelector(`[data-index="${nextIndex}"]`);
            target?.focus();
          });
        }
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.currentTarget.click();
      }
    },
    [itemData.length]
  );

  const OuterElement = useMemo(
    () =>
      React.forwardRef(function OuterElementComponent(props, ref) {
        return (
          <div
            {...props}
            ref={node => {
              if (typeof ref === 'function') {
                ref(node);
              } else if (ref) {
                // eslint-disable-next-line react-hooks/rules-of-hooks
                ref.current = node;
              }
              // eslint-disable-next-line react-hooks/rules-of-hooks
              outerRef.current = node;
            }}
            role="list"
            aria-label="Master library templates"
          />
        );
      }),
    [outerRef]
  );

  if (error) return <div role="alert">Master Library error</div>;

  return (
    <div aria-busy={isLoading}>
      <div style={hiddenStyles} aria-live="polite" role="status">{statusMessage}</div>
      <div className="mb-2 text-sm" aria-hidden="true">{statusMessage}</div>
      {isLoading ? (
        <div>Loading…</div>
      ) : hasResults ? (
        <List
          ref={listRef}
          height={listHeight}
          width="100%"
          itemSize={ITEM_HEIGHT}
          itemCount={itemData.length}
          itemData={itemData}
          outerElementType={OuterElement}
          itemKey={(index, data) => data[index]?.id ?? index}
        >
          {({ index, style, data }) => {
            const template = data[index];
            return (
              <div
                key={template.id ?? index}
                style={style}
                className="flex items-center border-b border-slate-200 px-2"
                role="listitem"
                tabIndex={0}
                data-index={index}
                onKeyDown={event => handleKeyDown(event, index)}
              >
                {template.title ?? 'Untitled template'}
              </div>
            );
          }}
        </List>
      ) : (
        <div className="rounded border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          No templates
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button disabled={page === 0} onClick={() => setPage(prev => Math.max(0, prev - 1))}>
          Prev
        </button>
        <button
          disabled={(page + 1) * limit >= count}
          onClick={() => setPage(prev => prev + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
