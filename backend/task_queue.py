"""
Async task queue using ThreadPoolExecutor for heavy processing (video editing, bulk downloads).
Provides progress tracking and status updates without blocking the API.
"""
import uuid
import time
import threading
from concurrent.futures import ThreadPoolExecutor, Future
from datetime import datetime
from typing import Callable, Any, Optional

class TaskInfo:
    """Holds metadata and progress for a running task."""
    
    def __init__(self, task_id: str, task_type: str, description: str = ""):
        self.task_id = task_id
        self.task_type = task_type
        self.description = description
        self.status = "queued"  # queued, running, completed, failed, cancelled
        self.progress = 0  # 0-100
        self.progress_message = ""
        self.result = None
        self.error = None
        self.created_at = datetime.utcnow()
        self.started_at = None
        self.completed_at = None
        self.future: Optional[Future] = None
        self.metadata = {}
    
    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "description": self.description,
            "status": self.status,
            "progress": self.progress,
            "progress_message": self.progress_message,
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "metadata": self.metadata
        }


class TaskQueue:
    """
    Lightweight async task manager backed by ThreadPoolExecutor.
    Replaces the need for Celery + Redis in a local/desktop context.
    
    Usage:
        queue = TaskQueue(max_workers=2)
        task_id = queue.submit("edit_batch", my_func, arg1, arg2, progress_callback=callback)
        status = queue.get_status(task_id)
    """
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls, *args, **kwargs):
        """Singleton: only one queue instance across the app."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self, max_workers: int = 2):
        if hasattr(self, "_initialized"):
            return
        self._initialized = True
        self.max_workers = max_workers
        self._executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="automadark_worker")
        self._tasks: dict[str, TaskInfo] = {}
        self._cleanup_lock = threading.Lock()
    
    def submit(
        self,
        task_type: str,
        func: Callable,
        *args,
        description: str = "",
        **kwargs
    ) -> str:
        """
        Submit a task for async execution.
        
        The function `func` will receive a `progress_callback(percent, message)` as
        its first argument if the function signature accepts it. This allows the
        task to report progress back to the queue.
        
        Returns the task_id for tracking.
        """
        task_id = str(uuid.uuid4())[:8]
        task_info = TaskInfo(task_id, task_type, description)
        
        # Create a progress callback bound to this task
        def progress_callback(percent: int, message: str = "", metadata: dict = None):
            task_info.progress = min(max(percent, 0), 100)
            task_info.progress_message = message
            if metadata is not None:
                task_info.metadata.update(metadata)
        
        def wrapper():
            task_info.status = "running"
            task_info.started_at = datetime.utcnow()
            try:
                result = func(progress_callback, *args, **kwargs)
                task_info.status = "completed"
                task_info.progress = 100
                task_info.result = result
                return result
            except Exception as e:
                task_info.status = "failed"
                task_info.error = str(e)
                raise
            finally:
                task_info.completed_at = datetime.utcnow()
        
        future = self._executor.submit(wrapper)
        task_info.future = future
        self._tasks[task_id] = task_info
        
        # Auto-cleanup old completed tasks (keep last 50)
        self._cleanup_old_tasks()
        
        return task_id
    
    def get_status(self, task_id: str) -> Optional[dict]:
        """Get current status of a task."""
        task = self._tasks.get(task_id)
        if task is None:
            return None
        return task.to_dict()
    
    def cancel(self, task_id: str) -> bool:
        """Attempt to cancel a queued/running task."""
        task = self._tasks.get(task_id)
        if task is None:
            return False
        if task.future and task.status in ("queued", "running"):
            cancelled = task.future.cancel()
            if cancelled:
                task.status = "cancelled"
                task.completed_at = datetime.utcnow()
            return cancelled
        return False
    
    def list_tasks(self, include_completed: bool = False) -> list[dict]:
        """List all active tasks, optionally including completed ones."""
        tasks = []
        for task in self._tasks.values():
            if include_completed or task.status in ("queued", "running"):
                tasks.append(task.to_dict())
        # Sort by created_at descending
        tasks.sort(key=lambda t: t["created_at"] or "", reverse=True)
        return tasks
    
    def _cleanup_old_tasks(self, keep: int = 50):
        """Remove old completed tasks from memory to prevent leaks."""
        with self._cleanup_lock:
            completed = [
                (tid, t) for tid, t in self._tasks.items()
                if t.status in ("completed", "failed", "cancelled")
            ]
            if len(completed) > keep:
                # Sort by completed_at and remove oldest
                completed.sort(key=lambda x: x[1].completed_at or datetime.min)
                for tid, _ in completed[:len(completed) - keep]:
                    del self._tasks[tid]


# Global singleton instance
task_queue = TaskQueue(max_workers=2)
