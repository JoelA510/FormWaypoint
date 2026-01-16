import { vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TemplateDetailsPanel from '../TemplateDetailsPanel';

const mockCheckTaskLibraryStatus = vi.fn();

vi.mock('../../../hooks/useMasterLibrary', () => ({
  useMasterLibrary: () => ({
    checkTaskLibraryStatus: mockCheckTaskLibraryStatus
  })
}));

describe('TemplateDetailsPanel', () => {
  beforeEach(() => {
    mockCheckTaskLibraryStatus.mockReset().mockResolvedValue(false);
  });

  function Harness({ task }) {
    const [counter, setCounter] = useState(0);
    return (
      <div>
        <button type="button" onClick={() => setCounter(prev => prev + 1)} data-testid="rerender">
          Re-render
        </button>
        <span data-testid="counter">{counter}</span>
        <TemplateDetailsPanel task={task} />
      </div>
    );
  }

  it('only checks status when the task id changes', async () => {
    const initialTask = { id: 'a', title: 'Task A' };
    const { rerender } = render(<Harness task={initialTask} />);

    await waitFor(() => expect(mockCheckTaskLibraryStatus).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('rerender'));
    await waitFor(() => expect(mockCheckTaskLibraryStatus).toHaveBeenCalledTimes(1));

    rerender(<Harness task={{ id: 'b', title: 'Task B' }} />);
    await waitFor(() => expect(mockCheckTaskLibraryStatus).toHaveBeenCalledTimes(2));
  });

  it('resets checking state when a task is cleared', async () => {
    const initialTask = { id: 'a', title: 'Task A' };
    const { rerender } = render(<Harness task={initialTask} />);

    await waitFor(() => expect(mockCheckTaskLibraryStatus).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('library-status')).toHaveTextContent('Template is not in the library.');

    rerender(<Harness task={null} />);

    await waitFor(() => expect(screen.getByTestId('library-status')).toHaveTextContent('Template is not in the library.'));
    expect(mockCheckTaskLibraryStatus).toHaveBeenCalledTimes(1);
  });

  it('resets library status flag when task becomes null', async () => {
    mockCheckTaskLibraryStatus.mockResolvedValueOnce(true);
    const initialTask = { id: 'a', title: 'Task A' };
    const { rerender } = render(<Harness task={initialTask} />);

    await waitFor(() =>
      expect(screen.getByTestId('library-status')).toHaveTextContent('Template is in the library.')
    );

    rerender(<Harness task={null} />);

    await waitFor(() =>
      expect(screen.getByTestId('library-status')).toHaveTextContent('Template is not in the library.')
    );
  });
});
