"""
Task ID Manager - Assigns unique IDs to each background task
"""

from datetime import datetime, timedelta
import threading
from typing import Optional
import uuid


class TaskIDManager:
    """Singleton class for managing task IDs"""

    _instance: Optional["TaskIDManager"] = None
    _lock = threading.Lock()
    _task_ids: dict[str, str] = {}  # task_key -> task_id
    _task_metadata: dict[str, dict] = {}  # task_id -> metadata

    @classmethod
    def get_instance(cls) -> "TaskIDManager":
        """Get singleton instance"""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def generate_task_id(
        self, task_type: str, task_key: str, owner_user_id: str | None = None
    ) -> str:
        """
        Generate unique ID for task.

        Args:
            task_type: Task type (e.g., 'kb_init', 'kb_upload', 'question_gen', 'solve', 'research')
            task_key: Task unique identifier (e.g., knowledge base name, question ID, etc.)
            owner_user_id: Session uid that created this task. Persisted in
                metadata and used by the stream endpoint to refuse a
                caller that does not match — even with the exact foreign
                task_id. Randomness of the id is NOT the security
                control; ownership is.

        Returns:
            Task ID (format: {task_type}_{timestamp}_{uuid})
        """
        with self._lock:
            # If task already exists, return existing ID
            if task_key in self._task_ids:
                return self._task_ids[task_key]

            # Generate new ID
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            unique_id = str(uuid.uuid4())[:8]
            task_id = f"{task_type}_{timestamp}_{unique_id}"

            # Save mapping and metadata
            self._task_ids[task_key] = task_id
            self._task_metadata[task_id] = {
                "task_type": task_type,
                "task_key": task_key,
                "created_at": datetime.now().isoformat(),
                "status": "running",
                "owner_user_id": owner_user_id,
            }

            return task_id

    def get_owner(self, task_id: str) -> str | None:
        """Return the owning user_id for a task, or None if unknown."""
        with self._lock:
            meta = self._task_metadata.get(task_id)
            if not meta:
                return None
            return meta.get("owner_user_id")

    def set_owner(self, task_id: str, owner_user_id: str) -> None:
        """Attach/overwrite the owner for an existing task_id. Used when
        a task is ensured before generate_task_id has run (e.g., external
        ensure_task calls), so ownership is always anchored."""
        with self._lock:
            meta = self._task_metadata.setdefault(
                task_id,
                {
                    "task_type": "unknown",
                    "task_key": task_id,
                    "created_at": datetime.now().isoformat(),
                    "status": "running",
                },
            )
            meta["owner_user_id"] = owner_user_id

    def get_task_id(self, task_key: str) -> str | None:
        """Get task ID"""
        with self._lock:
            return self._task_ids.get(task_key)

    def update_task_status(self, task_id: str, status: str, **kwargs):
        """Update task status"""
        with self._lock:
            if task_id in self._task_metadata:
                self._task_metadata[task_id]["status"] = status
                self._task_metadata[task_id].update(kwargs)
                if status in ["completed", "error", "cancelled"]:
                    self._task_metadata[task_id]["finished_at"] = datetime.now().isoformat()

    def get_task_metadata(self, task_id: str) -> dict | None:
        """Get task metadata"""
        with self._lock:
            return self._task_metadata.get(task_id, {}).copy()

    def cleanup_old_tasks(self, max_age_hours: int = 24):
        """Clean up old tasks (completed tasks older than specified hours)"""
        with self._lock:
            cutoff = datetime.now() - timedelta(hours=max_age_hours)

            to_remove = []
            for task_id, metadata in self._task_metadata.items():
                if metadata.get("status") in ["completed", "error", "cancelled"]:
                    finished_at = metadata.get("finished_at")
                    if finished_at:
                        try:
                            finished_time = datetime.fromisoformat(finished_at)
                            if finished_time < cutoff:
                                to_remove.append(task_id)
                        except:
                            pass

            for task_id in to_remove:
                metadata = self._task_metadata.pop(task_id, {})
                task_key = metadata.get("task_key")
                if task_key:
                    self._task_ids.pop(task_key, None)
