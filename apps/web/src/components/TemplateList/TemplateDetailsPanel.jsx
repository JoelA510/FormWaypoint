import { useEffect, useRef, useState } from 'react';
import { useMasterLibrary } from '../../hooks/useMasterLibrary';

export default function TemplateDetailsPanel({ task }) {
  const [isCheckingLibraryStatus, setIsCheckingLibraryStatus] = useState(false);
  const [isInLibrary, setIsInLibrary] = useState(false);
  const masterLibrary = useMasterLibrary();
  const checkStatusRef = useRef(masterLibrary.checkTaskLibraryStatus);

  useEffect(() => {
    checkStatusRef.current = masterLibrary.checkTaskLibraryStatus;
  }, [masterLibrary.checkTaskLibraryStatus]);

  useEffect(() => {
    if (!task?.id) {
      setIsCheckingLibraryStatus(false);
      setIsInLibrary(false);
    }
  }, [task?.id]);

  useEffect(() => {
    if (!task?.id) {
      return undefined;
    }
    let mounted = true;

    // Move setLoading inside promise or use a separate effect if needed, 
    // but here we can just set it. To satisfy linter, we can wrap in requestAnimationFrame or just ignore if it's truly safe.
    // Better: Only set if not already checking.
    setIsCheckingLibraryStatus(true);

    Promise.resolve(checkStatusRef.current(task.id))
      .then(inLibrary => {
        if (mounted) {
          setIsInLibrary(Boolean(inLibrary));
        }
      })
      .catch(() => {
        if (mounted) {
          setIsInLibrary(false);
        }
      })
      .finally(() => {
        if (mounted) {
          setIsCheckingLibraryStatus(false);
        }
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  return (
    <section aria-live="polite">
      <h2>{task?.title ?? 'Untitled template'}</h2>
      <p data-testid="library-status">
        {isCheckingLibraryStatus
          ? 'Checking library status…'
          : isInLibrary
            ? 'Template is in the library.'
            : 'Template is not in the library.'}
      </p>
    </section>
  );
}
