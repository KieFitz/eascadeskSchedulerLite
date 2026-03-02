from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.core.deps import get_current_user
from app.models.user import User
from app.services.template_generator import build_template_bytes

router = APIRouter(tags=["template"])


@router.get("/template")
async def download_template(current_user: User = Depends(get_current_user)):
    """Return the input Excel template in the user's configured language."""
    lang = "es" if current_user.country == "ES" else "en"
    xlsx_bytes = build_template_bytes(lang=lang)
    filename = "plantilla_horario.xlsx" if lang == "es" else "schedule_template.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
