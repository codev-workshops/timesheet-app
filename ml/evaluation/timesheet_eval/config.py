from __future__ import annotations

from dataclasses import asdict, dataclass, field

SPLIT_NAMES = ("train", "validation", "test")
SPLIT_STRATEGIES = ("random", "chronological")

DEFAULT_PROJECT_TYPE_RULES: dict[str, list[str]] = {
    "development": [
        "develop",
        "implement",
        "code",
        "coding",
        "feature",
        "bug",
        "fix",
        "refactor",
        "api",
        "backend",
        "frontend",
        "deploy",
        "migration",
        "integration",
    ],
    "testing": ["test", "qa", "regression", "verification"],
    "design": ["design", "mockup", "wireframe", "prototype", "ux", "ui"],
    "meetings": ["meeting", "standup", "sync", "call", "workshop", "planning", "kickoff"],
    "support": ["support", "ticket", "incident", "troubleshoot", "maintenance", "helpdesk"],
    "documentation": ["doc", "documentation", "write-up", "specification", "report"],
    "analysis": ["analysis", "analyse", "analyze", "research", "audit", "consult"],
}
DEFAULT_PROJECT_TYPE = "other"
DEFAULT_CLIENT_SEGMENT = "Unassigned"


@dataclass(frozen=True)
class EvalConfig:
    train_ratio: float = 0.7
    validation_ratio: float = 0.15
    test_ratio: float = 0.15
    split_strategy: str = "random"
    seed: int = 42
    analysis_split: str = "test"
    min_segment_size: int = 10
    bias_alpha: float = 0.05
    bias_threshold_hours: float = 0.25
    project_type_rules: dict[str, list[str]] = field(
        default_factory=lambda: {k: list(v) for k, v in DEFAULT_PROJECT_TYPE_RULES.items()}
    )

    def __post_init__(self) -> None:
        ratios = (self.train_ratio, self.validation_ratio, self.test_ratio)
        if any(r <= 0 or r >= 1 for r in ratios):
            raise ValueError(f"Split ratios must each be in (0, 1); got {ratios}")
        if abs(sum(ratios) - 1.0) > 1e-6:
            raise ValueError(f"Split ratios must sum to 1.0; got {sum(ratios):.6f}")
        if self.split_strategy not in SPLIT_STRATEGIES:
            raise ValueError(
                f"split_strategy must be one of {SPLIT_STRATEGIES}; got {self.split_strategy!r}"
            )
        if self.analysis_split not in SPLIT_NAMES:
            raise ValueError(
                f"analysis_split must be one of {SPLIT_NAMES}; got {self.analysis_split!r}"
            )
        if self.min_segment_size < 2:
            raise ValueError("min_segment_size must be >= 2")
        if not 0 < self.bias_alpha < 1:
            raise ValueError("bias_alpha must be in (0, 1)")
        if self.bias_threshold_hours < 0:
            raise ValueError("bias_threshold_hours must be >= 0")

    @property
    def ratios(self) -> dict[str, float]:
        return {
            "train": self.train_ratio,
            "validation": self.validation_ratio,
            "test": self.test_ratio,
        }

    def to_dict(self) -> dict[str, object]:
        return asdict(self)
