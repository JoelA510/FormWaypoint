import { useCallback, useMemo } from 'react';

export function useReportData(allTasks = []) {
  const tasksById = useMemo(
    () => new Map((allTasks ?? []).filter(task => task?.id != null).map(task => [task.id, task])),
    [allTasks]
  );

  const findRootProject = useCallback((taskId) => {
    if (taskId == null) {
      return null;
    }
    const visited = new Set();
    let currentTask = tasksById.get(taskId) ?? null;
    while (currentTask?.parent_task_id != null) {
      if (visited.has(currentTask.id)) {
        return null;
      }
      visited.add(currentTask.id);
      const nextTask = tasksById.get(currentTask.parent_task_id) ?? null;
      if (!nextTask) {
        return null;
      }
      currentTask = nextTask;
    }
    return currentTask ?? null;
  }, [tasksById]);

  return {
    tasksById,
    findRootProject
  };
}
