import { vi } from 'vitest';
/* eslint-disable react/display-name */

import { fireEvent, render, screen } from '@testing-library/react';
import MasterLibraryResults from '../MasterLibraryResults';
import { MasterLibraryContext } from '../../contexts/MasterLibraryContext';

vi.mock('react-window', async () => {
  const React = await vi.importActual('react');
  return {
    FixedSizeList: Object.assign(
      React.forwardRef(
        ({ itemCount, itemData, children, outerElementType: Outer = 'div' }, ref) => {
          React.useImperativeHandle(ref, () => ({
            scrollToItem: () => { }
          }));

          return (
            <Outer data-testid="virtual-list" data-count={itemCount}>
              {Array.from({ length: Math.min(itemCount, itemData.length, 5) }).map((_, index) =>
                children({ index, style: {}, data: itemData })
              )}
            </Outer>
          );
        }
      ),
      { displayName: 'FixedSizeList' }
    )
  };
});

beforeAll(() => {
  window.requestAnimationFrame = (callback) => callback();
});

describe('MasterLibraryResults', () => {
  it('renders metadata and virtualized templates', () => {
    const setPage = vi.fn();
    const items = Array.from({ length: 500 }, (_, index) => ({ id: `template-${index}`, title: `Template ${index}` }));

    render(
      <MasterLibraryContext.Provider
        value={{
          items,
          count: 500,
          page: 0,
          setPage,
          limit: 20,
          isLoading: false,
          error: null,
          checkTaskLibraryStatus: vi.fn()
        }}
      >
        <MasterLibraryResults />
      </MasterLibraryContext.Provider>
    );

    expect(screen.getByTestId('virtual-list')).toHaveAttribute('data-count', '500');
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByRole('list')).toHaveAttribute('aria-label', 'Master library templates');
    expect(screen.getByText('Prev')).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('1–20 of 500');
  });

  it('renders empty state when the library has no templates', () => {
    render(
      <MasterLibraryContext.Provider
        value={{
          items: [],
          count: 0,
          page: 0,
          setPage: vi.fn(),
          limit: 20,
          isLoading: false,
          error: null,
          checkTaskLibraryStatus: vi.fn()
        }}
      >
        <MasterLibraryResults />
      </MasterLibraryContext.Provider>
    );

    expect(screen.getByText('No templates')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('0 templates');
  });

  it('supports keyboard navigation between templates', () => {
    const items = Array.from({ length: 5 }, (_, index) => ({ id: index, title: `Template ${index}` }));

    render(
      <MasterLibraryContext.Provider
        value={{
          items,
          count: 5,
          page: 0,
          setPage: vi.fn(),
          limit: 20,
          isLoading: false,
          error: null,
          checkTaskLibraryStatus: vi.fn()
        }}
      >
        <MasterLibraryResults />
      </MasterLibraryContext.Provider>
    );

    const rows = screen.getAllByRole('listitem');
    rows[0].focus();
    expect(rows[0]).toHaveFocus();

    fireEvent.keyDown(rows[0], { key: 'ArrowDown' });
    expect(rows[1]).toHaveFocus();

    fireEvent.keyDown(rows[1], { key: 'ArrowUp' });
    expect(rows[0]).toHaveFocus();
  });
});
