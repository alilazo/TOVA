from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class StaffProfileView(BaseModel):
    id: str
    employee_id: str
    slug: str
    name: str
    display_name: str
    role: str
    role_key: str
    department: str
    seniority: str
    avatar: str
    status: str
    description: str
    model_profile: str
    tools: list[str]
    can_delegate: bool
    can_approve: bool
    tags: list[str]


class StaffProfileDocument(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str = Field(min_length=1)
    employee_id: str = Field(min_length=1)
    slug: str = Field(min_length=1)
    name: str = Field(min_length=1)
    display_name: str = Field(min_length=1)
    role: str = Field(min_length=1)
    role_key: str = Field(min_length=1)
    department: str = Field(min_length=1)
    seniority: str = Field(min_length=1)
    avatar: str = Field(min_length=1)
    status: str = Field(min_length=1)
    description: str = Field(min_length=1)
    model_profile: str = Field(min_length=1)
    tools: list[str]
    can_delegate: bool
    can_approve: bool
    tags: list[str]
    permissions: dict[str, Any]
    sections: dict[str, str]
    source_path: str

    def to_view(self) -> StaffProfileView:
        return StaffProfileView.model_validate(
            self.model_dump(include=set(StaffProfileView.model_fields))
        )


class StaffDocumentView(BaseModel):
    id: str
    slug: str
    markdown: str


class StaffDocumentUpdate(BaseModel):
    markdown: str = Field(min_length=1)


class StaffAvatarCatalog(BaseModel):
    stock: list[str]


class StaffAvatarUpdate(BaseModel):
    avatar: str = Field(min_length=1)


class StaffAvatarView(BaseModel):
    id: str
    avatar: str
