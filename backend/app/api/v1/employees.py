from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, require_pro_plan
from app.models.availability import EmployeeAvailability
from app.models.employee import Employee
from app.models.user import User
from app.schemas.employee import (
    AvailabilityIn,
    AvailabilityOut,
    EmployeeIn,
    EmployeeOut,
    EmployeeUpdate,
)

router = APIRouter(prefix="/employees", tags=["employees"])


async def _load_owned_employee(db: AsyncSession, employee_id: str, user: User) -> Employee:
    result = await db.execute(
        select(Employee).where(Employee.id == employee_id, Employee.user_id == user.id)
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    return employee


@router.get("/", response_model=list[EmployeeOut])
async def list_employees(
    current_user: User = Depends(require_pro_plan),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Employee).where(Employee.user_id == current_user.id).order_by(Employee.name)
    )
    return result.scalars().all()


@router.post("/", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
async def create_employee(
    body: EmployeeIn,
    current_user: User = Depends(require_pro_plan),
    db: AsyncSession = Depends(get_db),
):
    employee = Employee(user_id=current_user.id, **body.model_dump())
    db.add(employee)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        # phone is globally unique — surface a clear error to the manager.
        raise HTTPException(status_code=409, detail="An employee with this phone number already exists")
    await db.refresh(employee)
    return employee


@router.get("/{employee_id}", response_model=EmployeeOut)
async def get_employee(
    employee_id: str,
    current_user: User = Depends(require_pro_plan),
    db: AsyncSession = Depends(get_db),
):
    return await _load_owned_employee(db, employee_id, current_user)


@router.patch("/{employee_id}", response_model=EmployeeOut)
async def update_employee(
    employee_id: str,
    body: EmployeeUpdate,
    current_user: User = Depends(require_pro_plan),
    db: AsyncSession = Depends(get_db),
):
    employee = await _load_owned_employee(db, employee_id, current_user)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(employee, field, value)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="An employee with this phone number already exists")
    await db.refresh(employee)
    return employee


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_employee(
    employee_id: str,
    current_user: User = Depends(require_pro_plan),
    db: AsyncSession = Depends(get_db),
):
    employee = await _load_owned_employee(db, employee_id, current_user)
    await db.delete(employee)
    await db.commit()


@router.get("/{employee_id}/availability", response_model=list[AvailabilityOut])
async def list_availability(
    employee_id: str,
    current_user: User = Depends(require_pro_plan),
    db: AsyncSession = Depends(get_db),
):
    await _load_owned_employee(db, employee_id, current_user)
    result = await db.execute(
        select(EmployeeAvailability).where(EmployeeAvailability.employee_id == employee_id)
    )
    return result.scalars().all()


@router.post(
    "/{employee_id}/availability",
    response_model=AvailabilityOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_availability(
    employee_id: str,
    body: AvailabilityIn,
    current_user: User = Depends(require_pro_plan),
    db: AsyncSession = Depends(get_db),
):
    await _load_owned_employee(db, employee_id, current_user)
    if body.day_of_week is None and body.specific_date is None:
        raise HTTPException(
            status_code=400, detail="Provide either day_of_week or specific_date"
        )
    rule = EmployeeAvailability(employee_id=employee_id, **body.model_dump())
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete(
    "/{employee_id}/availability/{availability_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_availability(
    employee_id: str,
    availability_id: str,
    current_user: User = Depends(require_pro_plan),
    db: AsyncSession = Depends(get_db),
):
    await _load_owned_employee(db, employee_id, current_user)
    result = await db.execute(
        select(EmployeeAvailability).where(
            EmployeeAvailability.id == availability_id,
            EmployeeAvailability.employee_id == employee_id,
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Availability rule not found")
    await db.delete(rule)
    await db.commit()
