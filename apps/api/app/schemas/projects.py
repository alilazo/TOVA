from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ProjectRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    root: str


class SampleProjectRecord(ProjectRecord):
    starter_objective: str = Field(min_length=1)


class RecentProjectRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    root: str
    lastOpenedAt: datetime


class ProjectOpenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    path: str = Field(min_length=1)
    create: bool = False


class ProjectEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    path: str
    kind: Literal["file", "dir"]


class ProjectEntryCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    path: str = Field(min_length=1)
    kind: Literal["file", "dir"]


class ProjectEntryMoveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_path: str = Field(min_length=1)
    destination_path: str = Field(min_length=1)


class ProjectEntryDeleteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    path: str = Field(min_length=1)
    recursive: bool = False


class ProjectFile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    path: str
    content: str


class ProjectFileWriteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    path: str = Field(min_length=1)
    content: str
