"""
app.py
Magentify Mini — 소규모 제조업을 위한 거래처 주문 주기 & 이탈 위험 감지 로컬 에이전트
PRD Part 2 개발 명세 준수: 3개 화면 + 사이드바, 판정은 pandas / 말은 Liner Model API
디자인: 벡터·플랫 일러스트 스타일, 프리텐다드 폰트, 구글 머티리얼 심볼 적용
"""
import os
import json
from datetime import date, datetime
import pandas as pd
import streamlit as st

import core.models as models
import core.ingest as ingest
import core.analysis as analysis
import core.llm as llm
import core.store as store

# -----------------------------------------------------------------------------
# 1. 페이지 기본 설정 및 디자인 스타일 (Pretendard, Material Symbols, Flat Vector)
# -----------------------------------------------------------------------------
st.set_page_config(
    page_title="Magentify Mini — 거래처 관리 비서",
    page_icon="⚙️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# 커스텀 CSS 주입 (Pretendard 폰트, 구글 머티리얼 심볼, 플랫 벡터 테마)
CUSTOM_CSS = """
<link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />

<style>
/* 폰트 전역 적용 */
html, body, [class*="css"], .stMarkdown, .stButton, button, input, select, textarea {
    font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif !important;
}

/* 머티리얼 심볼 스타일 */
.material-symbols-outlined {
    font-family: 'Material Symbols Outlined' !important;
    font-weight: normal;
    font-style: normal;
    font-size: 20px;
    line-height: 1;
    letter-spacing: normal;
    text-transform: none;
    display: inline-block;
    white-space: nowrap;
    word-wrap: normal;
    direction: ltr;
    vertical-align: middle;
}

/* 플랫 카드 스타일 */
.flat-card {
    background-color: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 16px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.flat-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1.05rem;
    font-weight: 700;
    color: #1E293B;
    margin-bottom: 12px;
}

/* 상태별 플랫 배지 */
.badge-normal {
    background-color: #ECFDF5;
    color: #065F46;
    border: 1px solid #A7F3D0;
    padding: 3px 9px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.badge-attention {
    background-color: #FFFBEB;
    color: #92400E;
    border: 1px solid #FDE68A;
    padding: 3px 9px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.badge-risk {
    background-color: #FEF2F2;
    color: #991B1B;
    border: 1px solid #FECACA;
    padding: 3px 9px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.badge-high-risk {
    background-color: #F5F3FF;
    color: #5B21B6;
    border: 1px solid #DDD6FE;
    padding: 3px 9px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.badge-hold {
    background-color: #F1F5F9;
    color: #475569;
    border: 1px solid #CBD5E1;
    padding: 3px 9px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.badge-vip {
    background-color: #FEF3C7;
    color: #B45309;
    border: 1px solid #FCD34D;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 0.78rem;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    gap: 2px;
}

/* 통계 메트릭 카드 */
.metric-box {
    background-color: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 10px;
    padding: 14px 16px;
    text-align: center;
}
.metric-title {
    font-size: 0.85rem;
    color: #64748B;
    font-weight: 600;
}
.metric-val {
    font-size: 1.8rem;
    font-weight: 800;
    color: #0F172A;
    margin: 4px 0;
}
.metric-sub {
    font-size: 0.78rem;
    color: #94A3B8;
}

/* 출처 태그 */
.source-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.8rem;
    color: #475569;
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    padding: 3px 8px;
    border-radius: 4px;
    font-weight: 500;
}
</style>
"""
st.markdown(CUSTOM_CSS, unsafe_allow_html=True)


# -----------------------------------------------------------------------------
# 2. 상태 초기화 및 복원
# -----------------------------------------------------------------------------
def init_session():
    # SQLite DB 초기화
    store.init_db()

    defaults = {
        "page": "dashboard",             # data | dashboard | customer
        "raw_df": None,
        "mapping": None,
        "clean_df": None,
        "quality": None,
        "assessments": [],
        "ref_date": date(2026, 11, 30),  # 데모 기본 기준일
        "briefing": None,
        "selected_key": None,
        "demo_mode": True,
        "initialized": False
    }

    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v

    # 최초 1회 저장된 데이터 복원
    if not st.session_state.initialized:
        saved_ref = store.get_setting("ref_date")
        if saved_ref:
            try:
                st.session_state.ref_date = datetime.strptime(saved_ref, "%Y-%m-%d").date()
            except Exception:
                pass

        saved_path = store.get_setting("current_data_path")
        saved_map_str = store.get_setting("mapping_json")

        # 저장된 파일이 있으면 자동 복원
        if saved_path and os.path.exists(saved_path) and saved_map_str:
            try:
                mapping = json.loads(saved_map_str)
                with open(saved_path, "rb") as f:
                    raw_bytes = f.read()
                df = ingest.read_file(raw_bytes, os.path.basename(saved_path))
                quality = ingest.build_clean(df, mapping, st.session_state.ref_date)
                flags = store.get_flags()
                assessments = analysis.analyze(quality.clean_df, flags, st.session_state.ref_date)

                st.session_state.raw_df = df
                st.session_state.mapping = mapping
                st.session_state.clean_df = quality.clean_df
                st.session_state.quality = quality
                st.session_state.assessments = assessments
                st.session_state.page = "dashboard"
            except Exception:
                pass
        else:
            # 첫 실행 시 데모 파일이 존재하면 기본 로드
            demo_csv = "data/demo_transactions.csv"
            if os.path.exists(demo_csv):
                load_demo_data()

        st.session_state.initialized = True


def load_demo_data():
    """데모 데이터 126행 불러오기 및 기본 분석 실행"""
    demo_path = "data/demo_transactions.csv"
    if not os.path.exists(demo_path):
        from demo.make_demo_data import write_csv
        write_csv(demo_path)

    with open(demo_path, "rb") as f:
        data_bytes = f.read()

    # 사본 저장
    os.makedirs("data/uploads", exist_ok=True)
    saved_copy = "data/uploads/demo_transactions.csv"
    with open(saved_copy, "wb") as f:
        f.write(data_bytes)

    df = ingest.read_file(data_bytes, "demo_transactions.csv")
    mapping = ingest.suggest_mapping(df)

    # 데모 시드 플래그 주입
    store.seed_demo_flags()
    flags = store.get_flags()

    quality = ingest.build_clean(df, mapping, st.session_state.ref_date)
    assessments = analysis.analyze(quality.clean_df, flags, st.session_state.ref_date)

    st.session_state.raw_df = df
    st.session_state.mapping = mapping
    st.session_state.clean_df = quality.clean_df
    st.session_state.quality = quality
    st.session_state.assessments = assessments
    st.session_state.briefing = None

    # 설정 저장
    store.set_setting("current_data_path", saved_copy)
    store.set_setting("mapping_json", json.dumps(mapping, ensure_ascii=False))


def re_analyze():
    """기준일이나 플래그 변경 시 분석 재실행"""
    if st.session_state.clean_df is not None and not st.session_state.clean_df.empty:
        flags = store.get_flags()
        st.session_state.assessments = analysis.analyze(
            st.session_state.clean_df,
            flags,
            st.session_state.ref_date
        )


init_session()


# -----------------------------------------------------------------------------
# 3. 사이드바 (기준일, LLM 상태 배지, 데모 리셋, 네비게이션)
# -----------------------------------------------------------------------------
with st.sidebar:
    # 플랫 벡터 로고 및 타이틀
    st.markdown("""
    <div style="display: flex; align-items: center; gap: 10px; padding: 4px 0 16px 0;">
        <svg width="34" height="34" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="48" height="48" rx="10" fill="#2563EB"/>
            <path d="M14 34V20L24 14L34 20V34H14Z" fill="#93C5FD"/>
            <path d="M20 34V26H28V34H20Z" fill="#1D4ED8"/>
            <circle cx="34" cy="14" r="5" fill="#F59E0B"/>
        </svg>
        <div>
            <div style="font-size: 1.15rem; font-weight: 800; color: #0F172A; letter-spacing: -0.5px;">Magentify Mini</div>
            <div style="font-size: 0.76rem; color: #64748B;">제조업 거래 주기 & 이상 감지</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    st.divider()

    # LLM 상태 배지
    has_key = bool(llm.LINER_API_KEY and llm.LINER_API_KEY.strip())
    if has_key:
        st.markdown("""
        <div style="background: #ECFDF5; border: 1px solid #A7F3D0; padding: 8px 12px; border-radius: 8px; margin-bottom: 12px;">
            <div style="font-size: 0.8rem; font-weight: 700; color: #065F46; display: flex; align-items: center; gap: 6px;">
                <span class="material-symbols-outlined" style="font-size: 18px; color: #10B981;">check_circle</span>
                Liner Model API 연결됨
            </div>
            <div style="font-size: 0.72rem; color: #047857; margin-top: 2px;">라이브 생성 가능</div>
        </div>
        """, unsafe_allow_html=True)
    else:
        st.markdown("""
        <div style="background: #FFFBEB; border: 1px solid #FDE68A; padding: 8px 12px; border-radius: 8px; margin-bottom: 12px;">
            <div style="font-size: 0.8rem; font-weight: 700; color: #92400E; display: flex; align-items: center; gap: 6px;">
                <span class="material-symbols-outlined" style="font-size: 18px; color: #F59E0B;">info</span>
                기본 템플릿 (폴백 모드)
            </div>
            <div style="font-size: 0.72rem; color: #B45309; margin-top: 2px;">API 키 없이도 안전하게 동작</div>
        </div>
        """, unsafe_allow_html=True)

    # 분석 기준일 선택
    st.markdown("<div style='font-size: 0.85rem; font-weight: 600; color: #334155; margin-bottom: 4px;'>분석 기준일</div>", unsafe_allow_html=True)
    new_date = st.date_input(
        "분석 기준일",
        value=st.session_state.ref_date,
        label_visibility="collapsed"
    )
    if new_date != st.session_state.ref_date:
        st.session_state.ref_date = new_date
        store.set_setting("ref_date", new_date.strftime("%Y-%m-%d"))
        re_analyze()
        st.rerun()

    # 데모 모드 토글
    st.session_state.demo_mode = st.toggle("데모 모드 (응답 캐시 우선)", value=st.session_state.demo_mode)

    st.divider()

    # 화면 이동 메뉴
    st.markdown("<div style='font-size: 0.82rem; font-weight: 700; color: #64748B; text-transform: uppercase;'>화면 바로가기</div>", unsafe_allow_html=True)
    col_nav1, col_nav2 = st.columns(2)
    with col_nav1:
        if st.button("📊 대시보드", use_container_width=True, type="primary" if st.session_state.page == "dashboard" else "secondary"):
            st.session_state.page = "dashboard"
            st.rerun()
    with col_nav2:
        if st.button("📁 데이터 등록", use_container_width=True, type="primary" if st.session_state.page == "data" else "secondary"):
            st.session_state.page = "data"
            st.rerun()

    st.divider()

    # 데모 리셋 버튼
    st.markdown("<div style='font-size: 0.85rem; font-weight: 600; color: #334155;'>시연 환경 관리</div>", unsafe_allow_html=True)
    reset_confirm = st.checkbox("초기화 확인 (접촉·초안 삭제)", value=False)
    if st.button("🔄 데모 리셋", disabled=not reset_confirm, use_container_width=True):
        store.reset_demo()
        st.session_state.ref_date = date(2026, 11, 30)
        store.set_setting("ref_date", "2026-11-30")
        load_demo_data()
        st.success("데모 시드(126행, VIP 2곳, 프로젝트성 1곳)로 초기화되었습니다.")
        st.session_state.page = "dashboard"
        st.rerun()


# -----------------------------------------------------------------------------
# 4. 화면 1: 데이터 등록 및 품질 검사 (data)
# -----------------------------------------------------------------------------
def render_data_page():
    st.markdown("""
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
        <div>
            <h2 style="font-weight: 800; color: #0F172A; margin: 0; font-size: 1.6rem;">📁 거래 데이터 등록 및 품질 검사</h2>
            <div style="color: #64748B; font-size: 0.92rem; margin-top: 4px;">CSV 또는 XLSX 거래 원장을 업로드하고 데이터 정합성을 확인합니다.</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    col_btn, col_upload = st.columns([1, 2])
    with col_btn:
        st.markdown("<div style='font-size: 0.9rem; font-weight: 700; color: #1E293B; margin-bottom: 8px;'>데모 원클릭</div>", unsafe_allow_html=True)
        if st.button("📥 데모 파일 불러오기 (126행)", type="primary", use_container_width=True):
            load_demo_data()
            st.success("데모 거래 데이터(126행)를 성공적으로 불러왔습니다.")
            st.rerun()

    with col_upload:
        st.markdown("<div style='font-size: 0.9rem; font-weight: 700; color: #1E293B; margin-bottom: 8px;'>새 파일 업로드</div>", unsafe_allow_html=True)
        uploaded_file = st.file_uploader(
            "파일 선택 (CSV 또는 XLSX, 최대 10MB)",
            type=["csv", "xlsx", "xls"],
            label_visibility="collapsed"
        )
        if uploaded_file is not None:
            data_bytes = uploaded_file.read()
            try:
                df = ingest.read_file(data_bytes, uploaded_file.name)
                mapping = ingest.suggest_mapping(df)

                # 파일 사본 저장
                os.makedirs("data/uploads", exist_ok=True)
                save_path = f"data/uploads/{uploaded_file.name}"
                with open(save_path, "wb") as f:
                    f.write(data_bytes)

                quality = ingest.build_clean(df, mapping, st.session_state.ref_date)
                flags = store.get_flags()
                assessments = analysis.analyze(quality.clean_df, flags, st.session_state.ref_date)

                st.session_state.raw_df = df
                st.session_state.mapping = mapping
                st.session_state.clean_df = quality.clean_df
                st.session_state.quality = quality
                st.session_state.assessments = assessments

                store.set_setting("current_data_path", save_path)
                store.set_setting("mapping_json", json.dumps(mapping, ensure_ascii=False))
                st.success(f"'{uploaded_file.name}' 업로드 및 분석 완료")
                st.rerun()
            except models.AppError as e:
                st.error(f"[{e.code}] {e.message}")
            except Exception as e:
                st.error(f"파일 처리 중 오류 발생: {e}")

    # 현재 로드된 데이터가 있을 경우 상세 표시
    if st.session_state.raw_df is not None:
        st.markdown("---")
        df = st.session_state.raw_df
        cols = list(df.columns)

        st.markdown(f"""
        <div style="display: flex; gap: 16px; margin-bottom: 14px; font-size: 0.88rem; color: #475569;">
            <span><strong style="color: #0F172A;">총 행 수:</strong> {len(df):,}행</span>
            <span><strong style="color: #0F172A;">열 수:</strong> {len(cols)}개</span>
        </div>
        """, unsafe_allow_html=True)

        # 상위 5행 미리보기
        with st.expander("🔍 원본 데이터 상위 5행 미리보기", expanded=True):
            st.dataframe(df.head(5), use_container_width=True)

        st.markdown("<h4 style='font-weight: 700; color: #1E293B; margin-top: 20px;'>컬럼 자동 인식 및 매핑 확인</h4>", unsafe_allow_html=True)
        col_m1, col_m2, col_m3, col_m4 = st.columns(4)

        opt_cols = ["(없음)"] + cols
        cur_map = st.session_state.mapping or {}

        def get_idx(val):
            return opt_cols.index(val) if val in opt_cols else 0

        with col_m1:
            st.markdown("<strong>거래처 열 (필수)</strong>", unsafe_allow_html=True)
            sel_c = st.selectbox("거래처", opt_cols, index=get_idx(cur_map.get("customer")), key="map_c")
        with col_m2:
            st.markdown("<strong>거래일 열 (필수)</strong>", unsafe_allow_html=True)
            sel_d = st.selectbox("거래일", opt_cols, index=get_idx(cur_map.get("date")), key="map_d")
        with col_m3:
            st.markdown("금액 열 (선택)", unsafe_allow_html=True)
            sel_a = st.selectbox("금액", opt_cols, index=get_idx(cur_map.get("amount")), key="map_a")
        with col_m4:
            st.markdown("품목 열 (선택)", unsafe_allow_html=True)
            sel_i = st.selectbox("품목", opt_cols, index=get_idx(cur_map.get("item")), key="map_i")

        new_mapping = {
            "customer": sel_c if sel_c != "(없음)" else None,
            "date": sel_d if sel_d != "(없음)" else None,
            "amount": sel_a if sel_a != "(없음)" else None,
            "item": sel_i if sel_i != "(없음)" else None,
        }

        # 품질 검사 5종 결과 카드
        if st.session_state.quality:
            q = st.session_state.quality
            st.markdown("<h4 style='font-weight: 700; color: #1E293B; margin-top: 24px;'>품질 검사 결과 (5종 검증)</h4>", unsafe_allow_html=True)

            q1, q2, q3, q4, q5 = st.columns(5)
            with q1:
                st.markdown(f"""
                <div class="metric-box" style="border-top: 4px solid #10B981;">
                    <div class="metric-title">정상 거래</div>
                    <div class="metric-val" style="color: #059669;">{q.counts['ok']}</div>
                    <div class="metric-sub">분석 반영 행</div>
                </div>
                """, unsafe_allow_html=True)
            with q2:
                st.markdown(f"""
                <div class="metric-box" style="border-top: 4px solid #F59E0B;">
                    <div class="metric-title">완전 중복</div>
                    <div class="metric-val" style="color: #D97706;">{q.counts['duplicate']}</div>
                    <div class="metric-sub">첫 행만 유지</div>
                </div>
                """, unsafe_allow_html=True)
            with q3:
                st.markdown(f"""
                <div class="metric-box" style="border-top: 4px solid #EF4444;">
                    <div class="metric-title">취소 후보 (음수)</div>
                    <div class="metric-val" style="color: #DC2626;">{q.counts['negative']}</div>
                    <div class="metric-sub">분석 제외</div>
                </div>
                """, unsafe_allow_html=True)
            with q4:
                st.markdown(f"""
                <div class="metric-box" style="border-top: 4px solid #6366F1;">
                    <div class="metric-title">날짜 변환 오류</div>
                    <div class="metric-val" style="color: #4F46E5;">{q.counts['invalid']}</div>
                    <div class="metric-sub">분석 제외</div>
                </div>
                """, unsafe_allow_html=True)
            with q5:
                st.markdown(f"""
                <div class="metric-box" style="border-top: 4px solid #64748B;">
                    <div class="metric-title">미래 날짜</div>
                    <div class="metric-val" style="color: #475569;">{q.counts['future']}</div>
                    <div class="metric-sub">분석 제외</div>
                </div>
                """, unsafe_allow_html=True)

            # 제외된 행 목록
            if not q.issues_df.empty:
                st.markdown("<div style='font-size: 0.95rem; font-weight: 700; color: #1E293B; margin-top: 18px;'>⚠️ 분석에서 제외된 행 목록</div>", unsafe_allow_html=True)
                st.dataframe(q.issues_df, use_container_width=True)

            # 유사 거래처명 경고
            if q.similar_pairs:
                st.markdown("<div style='font-size: 0.95rem; font-weight: 700; color: #1E293B; margin-top: 18px;'>🔍 유사 거래처명 감지 (자동 병합 없음)</div>", unsafe_allow_html=True)
                for p1, p2 in q.similar_pairs:
                    st.info(f"💡 유사 이름 감지: **'{p1}'** ↔ **'{p2}'** (원장 표기 차이일 수 있으나 개별 분석을 진행합니다)")

        # 분석 실행 버튼
        st.markdown("<br>", unsafe_allow_html=True)
        can_run = (new_mapping["customer"] is not None and new_mapping["date"] is not None and new_mapping["customer"] != new_mapping["date"])
        if st.button("🚀 분석 실행 및 대시보드로 이동", type="primary", disabled=not can_run, use_container_width=True):
            try:
                quality = ingest.build_clean(df, new_mapping, st.session_state.ref_date)
                flags = store.get_flags()
                assessments = analysis.analyze(quality.clean_df, flags, st.session_state.ref_date)

                st.session_state.mapping = new_mapping
                st.session_state.clean_df = quality.clean_df
                st.session_state.quality = quality
                st.session_state.assessments = assessments
                st.session_state.page = "dashboard"
                store.set_setting("mapping_json", json.dumps(new_mapping, ensure_ascii=False))
                st.rerun()
            except models.AppError as e:
                st.error(f"[{e.code}] {e.message}")


# -----------------------------------------------------------------------------
# 5. 화면 2: 현황 대시보드 (dashboard)
# -----------------------------------------------------------------------------
def render_dashboard_page():
    assessments = st.session_state.assessments
    if not assessments:
        st.info("거래 데이터가 아직 없습니다. 사이드바 또는 아래 버튼으로 데모 데이터를 불러오세요.")
        if st.button("📥 데모 데이터 불러오기", type="primary"):
            load_demo_data()
            st.rerun()
        return

    # 최신성 검사 (기준일과 마지막 거래일 차이가 30일 초과 시 배너)
    all_last_dates = [a.last_date for a in assessments if a.last_date]
    if all_last_dates:
        latest_file_date = max(all_last_dates)
        diff_days = (st.session_state.ref_date - latest_file_date).days
        if diff_days > 30:
            st.warning(f"⚠️ **데이터가 오래되었습니다**: 파일 내 최신 거래일({latest_file_date})과 분석 기준일({st.session_state.ref_date})의 차이가 {diff_days}일입니다.")

    summary = analysis.summarize(assessments)

    # 대시보드 상단 헤더
    st.markdown(f"""
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
        <div>
            <h2 style="font-weight: 800; color: #0F172A; margin: 0; font-size: 1.6rem;">📊 거래처 주문 주기 & 이탈 위험 대시보드</h2>
            <div style="color: #64748B; font-size: 0.92rem; margin-top: 4px;">분석 기준일: <strong>{st.session_state.ref_date.strftime('%Y년 %m월 %d일')}</strong> | 총 관리 거래처: <strong>{len(assessments)}곳</strong></div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    # 요약 카드 5개 (정상, 관심, 위험 후보, 고위험 후보, 판단 보류)
    c1, c2, c3, c4, c5 = st.columns(5)
    with c1:
        st.markdown(f"""
        <div class="metric-box" style="border-top: 4px solid #10B981;">
            <div class="metric-title">정상 관리</div>
            <div class="metric-val" style="color: #059669;">{summary['normal']}</div>
            <div class="metric-sub">정기 거래 범위 (≤1.5배)</div>
        </div>
        """, unsafe_allow_html=True)
    with c2:
        st.markdown(f"""
        <div class="metric-box" style="border-top: 4px solid #F59E0B;">
            <div class="metric-title">관심 필요</div>
            <div class="metric-val" style="color: #D97706;">{summary['attention']}</div>
            <div class="metric-sub">흐름 확인 (1.5~2.0배)</div>
        </div>
        """, unsafe_allow_html=True)
    with c3:
        st.markdown(f"""
        <div class="metric-box" style="border-top: 4px solid #DC2626;">
            <div class="metric-title">이탈 위험 후보</div>
            <div class="metric-val" style="color: #DC2626;">{summary['risk']}</div>
            <div class="metric-sub">우선 연락 (2.0~3.0배)</div>
        </div>
        """, unsafe_allow_html=True)
    with c4:
        st.markdown(f"""
        <div class="metric-box" style="border-top: 4px solid #7C3AED;">
            <div class="metric-title">고위험 후보</div>
            <div class="metric-val" style="color: #7C3AED;">{summary['high_risk']}</div>
            <div class="metric-sub">대표 우선 확인 (≥3.0배)</div>
        </div>
        """, unsafe_allow_html=True)
    with c5:
        st.markdown(f"""
        <div class="metric-box" style="border-top: 4px solid #64748B;">
            <div class="metric-title">판단 보류</div>
            <div class="metric-val" style="color: #475569;">{summary['hold']}</div>
            <div class="metric-sub">데이터 부족/프로젝트성</div>
        </div>
        """, unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)

    # -------------------------------------------------------------------------
    # 주간 브리핑 카드 (Liner Model API)
    # -------------------------------------------------------------------------
    priority_list = analysis.prioritize(assessments)

    st.markdown("""
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
        <div style="font-size: 1.15rem; font-weight: 700; color: #1E293B; display: flex; align-items: center; gap: 8px;">
            <span class="material-symbols-outlined" style="color: #2563EB;">article</span>
            이번 주 브리핑
        </div>
    </div>
    """, unsafe_allow_html=True)

    col_b1, col_b2, _ = st.columns([1.5, 1.5, 4])
    with col_b1:
        if st.button("✨ 이번 주 브리핑 생성", use_container_width=True, type="primary"):
            with st.spinner("Liner Model API 브리핑 작성 중..."):
                st.session_state.briefing = llm.generate_briefing(
                    priority_list,
                    summary,
                    demo_mode=st.session_state.demo_mode,
                    force_live=False
                )
                st.rerun()
    with col_b2:
        if st.button("🔄 새로 생성 (Live)", use_container_width=True):
            with st.spinner("라이브 API 실시간 호출 중..."):
                st.session_state.briefing = llm.generate_briefing(
                    priority_list,
                    summary,
                    demo_mode=st.session_state.demo_mode,
                    force_live=True
                )
                st.rerun()

    if st.session_state.briefing:
        b_res = st.session_state.briefing
        b_content = b_res.content

        # 라벨 설정
        if b_res.source == "live":
            src_label = "Liner Model API 응답"
            src_color = "#2563EB"
        elif b_res.source == "cache":
            src_label = "Liner Model API 응답(저장본)"
            src_color = "#059669"
        else:
            src_label = "기본 템플릿(폴백)"
            src_color = "#D97706"

        # 별칭 -> 실제 거래처명 매핑
        alias_to_name = {a.alias: a.display_name for a in assessments}

        st.markdown(f"""
        <div class="flat-card" style="border-left: 5px solid {src_color}; margin-top: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span style="font-size: 1.1rem; font-weight: 800; color: #0F172A;">{b_content.get('headline', '')}</span>
                <span class="source-tag"><span class="material-symbols-outlined" style="font-size: 16px;">bolt</span> {src_label}</span>
            </div>
            <div style="margin-bottom: 14px;">
        """, unsafe_allow_html=True)

        for item in b_content.get("items", []):
            item_id = item.get("id", "")
            c_name = alias_to_name.get(item_id, item_id)
            act_label = "✉️ 이메일 권장" if item.get("action") == "email" else "📞 통화 권장"
            st.markdown(f"""
            <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 14px; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <strong style="color: #1E293B; font-size: 0.95rem;">{c_name}</strong>
                    <span style="font-size: 0.8rem; background: #EEF2FF; color: #4338CA; padding: 2px 8px; border-radius: 4px; font-weight: 600;">{act_label} · {item.get('tone', '정중')}</span>
                </div>
                <div style="color: #475569; font-size: 0.88rem; margin-top: 4px;">{item.get('reason', '')}</div>
            </div>
            """, unsafe_allow_html=True)

        caution = b_content.get("caution", "")
        if caution:
            st.markdown(f"""
            </div>
            <div style="font-size: 0.82rem; color: #94A3B8; border-top: 1px dashed #E2E8F0; padding-top: 8px; display: flex; align-items: center; gap: 4px;">
                <span class="material-symbols-outlined" style="font-size: 16px;">info</span> {caution}
            </div>
        </div>
        """, unsafe_allow_html=True)
        else:
            st.markdown("</div></div>", unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)

    # -------------------------------------------------------------------------
    # 우선 확인 목록 (최대 10곳)
    # -------------------------------------------------------------------------
    st.markdown("""
    <div style="font-size: 1.15rem; font-weight: 700; color: #1E293B; display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
        <span class="material-symbols-outlined" style="color: #DC2626;">priority_high</span>
        우선 확인 거래처 목록 (대표 연락 검토 권장)
    </div>
    """, unsafe_allow_html=True)

    if not priority_list:
        st.success("현재 주의가 필요한 이상 거래처가 없습니다. 모든 거래처가 정기 거래 범위 내에 있습니다.")
    else:
        # 테이블 헤더
        cols_w = [0.6, 2.0, 1.6, 1.4, 1.1, 1.1, 1.0, 1.1, 1.5]
        h0, h1, h2, h3, h4, h5, h6, h7, h8 = st.columns(cols_w)
        h0.markdown("<strong>순위</strong>", unsafe_allow_html=True)
        h1.markdown("<strong>거래처</strong>", unsafe_allow_html=True)
        h2.markdown("<strong>상태</strong>", unsafe_allow_html=True)
        h3.markdown("<strong>최근 거래일</strong>", unsafe_allow_html=True)
        h4.markdown("<strong>공백</strong>", unsafe_allow_html=True)
        h5.markdown("<strong>평소 간격</strong>", unsafe_allow_html=True)
        h6.markdown("<strong>배수</strong>", unsafe_allow_html=True)
        h7.markdown("<strong>신뢰도</strong>", unsafe_allow_html=True)
        h8.markdown("<strong>조치</strong>", unsafe_allow_html=True)
        st.markdown("<hr style='margin: 4px 0 10px 0;'>", unsafe_allow_html=True)

        for rank, a in enumerate(priority_list[:10], start=1):
            r0, r1, r2, r3, r4, r5, r6, r7, r8 = st.columns(cols_w)
            r0.markdown(f"**{rank}**")

            # 거래처명 & VIP 배지
            vip_html = '<span class="badge-vip">VIP</span>' if a.vip else ""
            r1.markdown(f"**{a.display_name}** {vip_html}", unsafe_allow_html=True)

            # 상태 배지
            if a.status == "high_risk":
                badge_html = '<span class="badge-high-risk">고위험 후보</span>'
            elif a.status == "risk":
                badge_html = '<span class="badge-risk">이탈 위험 후보</span>'
            elif a.status == "attention":
                badge_html = '<span class="badge-attention">관심 필요</span>'
            else:
                badge_html = '<span class="badge-normal">정상</span>'
            r2.markdown(badge_html, unsafe_allow_html=True)

            r3.markdown(a.last_date.strftime("%Y-%m-%d") if a.last_date else "-")
            r4.markdown(f"{a.gap_days}일")
            r5.markdown(f"{int(a.median_interval)}일" if a.median_interval else "-")
            r6.markdown(f"**{a.ratio}배**" if a.ratio else "-")
            conf_str = "높음" if a.confidence == "high" else "보통"
            r7.markdown(conf_str)

            # 문안 준비 버튼
            def make_click_cb(cust_key):
                def cb():
                    st.session_state.selected_key = cust_key
                    st.session_state.page = "customer"
                return cb

            r8.button(
                "문안 준비 ➡️",
                key=f"btn_prep_{a.customer_key}",
                on_click=make_click_cb(a.customer_key),
                use_container_width=True
            )

    st.markdown("<br><hr>", unsafe_allow_html=True)

    # -------------------------------------------------------------------------
    # 후속 조치 예정 (Next contact dates)
    # -------------------------------------------------------------------------
    st.markdown("""
    <div style="font-size: 1.15rem; font-weight: 700; color: #1E293B; display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
        <span class="material-symbols-outlined" style="color: #0284C7;">calendar_month</span>
        후속 조치 예정 현황
    </div>
    """, unsafe_allow_html=True)

    followups = store.followups(st.session_state.ref_date.strftime("%Y-%m-%d"))
    if not followups:
        st.markdown("<div style='color: #64748B; font-size: 0.88rem;'>현재 예정된 후속 조치 일정이 없습니다. 거래처 상세 화면에서 다음 연락일을 등록하세요.</div>", unsafe_allow_html=True)
    else:
        f_cols = [2.0, 1.5, 1.5, 2.0, 3.0, 1.5]
        fh1, fh2, fh3, fh4, fh5, fh6 = st.columns(f_cols)
        fh1.markdown("<strong>거래처</strong>", unsafe_allow_html=True)
        fh2.markdown("<strong>상태</strong>", unsafe_allow_html=True)
        fh3.markdown("<strong>다음 연락일</strong>", unsafe_allow_html=True)
        fh4.markdown("<strong>최근 접촉</strong>", unsafe_allow_html=True)
        fh5.markdown("<strong>메모</strong>", unsafe_allow_html=True)
        fh6.markdown("<strong>바로가기</strong>", unsafe_allow_html=True)

        for fu in followups:
            fr1, fr2, fr3, fr4, fr5, fr6 = st.columns(f_cols)
            fr1.markdown(f"**{fu['display_name']}**")
            if fu["followup_status"] == "후속 조치 필요":
                st_badge = '<span style="background: #FEE2E2; color: #991B1B; padding: 2px 7px; border-radius: 4px; font-size: 0.8rem; font-weight: 700;">후속 조치 필요</span>'
            else:
                st_badge = '<span style="background: #E0F2FE; color: #0369A1; padding: 2px 7px; border-radius: 4px; font-size: 0.8rem; font-weight: 700;">예정</span>'
            fr2.markdown(st_badge, unsafe_allow_html=True)
            fr3.markdown(f"**{fu['next_contact_date']}**")

            outcome_map = {
                "planned": "연락 예정",
                "contacted": "연락 완료",
                "waiting_reply": "회신 대기",
                "quote_requested": "견적 요청",
                "reorder_confirmed": "재주문 확인",
                "on_hold": "거래 보류",
                "not_needed": "연락 불필요"
            }
            channel_map = {"email": "이메일", "phone": "전화", "other": "기타"}
            fr4.markdown(f"{channel_map.get(fu['channel'], fu['channel'])} / {outcome_map.get(fu['outcome'], fu['outcome'])}")
            fr5.markdown(fu["note"] or "-")

            def make_fu_click(k):
                def cb():
                    st.session_state.selected_key = k
                    st.session_state.page = "customer"
                return cb

            fr6.button("상세 보기", key=f"btn_fu_{fu['id']}", on_click=make_fu_click(fu["customer_key"]), use_container_width=True)


# -----------------------------------------------------------------------------
# 6. 화면 3: 거래처 상세 및 문안 준비 (customer)
# -----------------------------------------------------------------------------
def render_customer_page():
    assessments = st.session_state.assessments
    if not assessments:
        st.info("거래 데이터가 없습니다. 데이터 등록 화면에서 먼저 데이터를 등록하세요.")
        return

    key_map = {a.customer_key: a for a in assessments}
    keys_list = [a.customer_key for a in assessments]

    # 기본 선택 거래처
    curr_key = st.session_state.selected_key
    if curr_key not in key_map:
        curr_key = keys_list[0]

    # 거래처 선택 셀렉트박스
    st.markdown("""
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <h2 style="font-weight: 800; color: #0F172A; margin: 0; font-size: 1.5rem;">🏢 거래처 분석 근거 및 연락 문안</h2>
    </div>
    """, unsafe_allow_html=True)

    col_sel, col_back = st.columns([3, 1])
    with col_sel:
        def on_change_select():
            st.session_state.selected_key = st.session_state.cust_select

        selected_key = st.selectbox(
            "분석할 거래처를 선택하세요",
            keys_list,
            index=keys_list.index(curr_key),
            format_func=lambda k: f"{key_map[k].display_name} ({'VIP ' if key_map[k].vip else ''}{key_map[k].status})",
            key="cust_select",
            on_change=on_change_select
        )
    with col_back:
        st.markdown("<div style='height: 28px;'></div>", unsafe_allow_html=True)
        if st.button("⬅️ 대시보드로 돌아가기", use_container_width=True):
            st.session_state.page = "dashboard"
            st.rerun()

    a = key_map[selected_key]

    # 거래처 헤더 정보
    st.markdown("---")
    header_col1, header_col2 = st.columns([3, 1])
    with header_col1:
        vip_tag = '<span class="badge-vip" style="font-size: 0.9rem; margin-left: 8px;">⭐ VIP 거래처</span>' if a.vip else ""
        st.markdown(f"<div style='display: flex; align-items: center;'><h3 style='margin: 0; font-weight: 800; color: #0F172A;'>{a.display_name}</h3>{vip_tag}</div>", unsafe_allow_html=True)
    with header_col2:
        if a.status == "high_risk":
            st_html = '<span class="badge-high-risk" style="font-size: 1rem; padding: 6px 14px;">🚨 고위험 후보</span>'
        elif a.status == "risk":
            st_html = '<span class="badge-risk" style="font-size: 1rem; padding: 6px 14px;">⚠️ 이탈 위험 후보</span>'
        elif a.status == "attention":
            st_html = '<span class="badge-attention" style="font-size: 1rem; padding: 6px 14px;">👀 관심 필요</span>'
        elif a.status == "normal":
            st_html = '<span class="badge-normal" style="font-size: 1rem; padding: 6px 14px;">✅ 정상 관리</span>'
        else:
            st_html = '<span class="badge-hold" style="font-size: 1rem; padding: 6px 14px;">⏸️ 판단 보류</span>'
        st.markdown(f"<div style='text-align: right;'>{st_html}</div>", unsafe_allow_html=True)

    # 플래그 체크박스 2개 (VIP, 프로젝트성)
    col_f1, col_f2, _ = st.columns([1.5, 1.8, 3])
    with col_f1:
        new_vip = st.checkbox("VIP 거래처 지정", value=a.vip, key=f"chk_vip_{a.customer_key}")
    with col_f2:
        new_proj = st.checkbox("비정기 프로젝트성 거래처", value=a.project_based, key=f"chk_proj_{a.customer_key}")

    if new_vip != a.vip or new_proj != a.project_based:
        store.set_flag(a.customer_key, a.display_name, vip=new_vip, project_based=new_proj)
        re_analyze()
        st.rerun()

    st.markdown("<br>", unsafe_allow_html=True)

    # -------------------------------------------------------------------------
    # 근거 카드 (숫자 근거 & 고정 문구)
    # -------------------------------------------------------------------------
    st.markdown("""
    <div style="font-size: 1.05rem; font-weight: 700; color: #1E293B; display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
        <span class="material-symbols-outlined" style="color: #2563EB;">analytics</span>
        데이터 기반 분석 근거
    </div>
    """, unsafe_allow_html=True)

    card_col1, card_col2, card_col3, card_col4, card_col5 = st.columns(5)
    with card_col1:
        st.markdown(f"""
        <div class="metric-box">
            <div class="metric-title">최근 거래일</div>
            <div class="metric-val" style="font-size: 1.15rem;">{a.last_date.strftime('%Y-%m-%d') if a.last_date else '-'}</div>
            <div class="metric-sub">최근 발주 일자</div>
        </div>
        """, unsafe_allow_html=True)
    with card_col2:
        st.markdown(f"""
        <div class="metric-box">
            <div class="metric-title">공백 일수</div>
            <div class="metric-val" style="font-size: 1.3rem; color: #DC2626;">{a.gap_days}일</div>
            <div class="metric-sub">기준일 대비 경과</div>
        </div>
        """, unsafe_allow_html=True)
    with card_col3:
        st.markdown(f"""
        <div class="metric-box">
            <div class="metric-title">평소 주문 주기</div>
            <div class="metric-val" style="font-size: 1.3rem;">{f"{int(a.median_interval)}일" if a.median_interval else "-"}</div>
            <div class="metric-sub">간격 중앙값</div>
        </div>
        """, unsafe_allow_html=True)
    with card_col4:
        st.markdown(f"""
        <div class="metric-box">
            <div class="metric-title">주기 대비 배수</div>
            <div class="metric-val" style="font-size: 1.3rem; color: #7C3AED;">{f"{a.ratio}배" if a.ratio else "-"}</div>
            <div class="metric-sub">공백 / 평소 간격</div>
        </div>
        """, unsafe_allow_html=True)
    with card_col5:
        conf_badge = "높음 (10회 이상)" if a.confidence == "high" else ("보통 (5~9회)" if a.confidence == "medium" else "부족")
        st.markdown(f"""
        <div class="metric-box">
            <div class="metric-title">분석 신뢰도</div>
            <div class="metric-val" style="font-size: 1.1rem; color: #0284C7;">{conf_badge}</div>
            <div class="metric-sub">총 거래일 수 {a.txn_days}일</div>
        </div>
        """, unsafe_allow_html=True)

    # 확인 질문 2개 및 고정 문구
    st.markdown(f"""
    <div class="flat-card" style="margin-top: 14px; background: #F8FAFC; border: 1px solid #E2E8F0;">
        <div style="font-weight: 700; color: #1E293B; font-size: 0.95rem; margin-bottom: 6px;">💡 대표 확인 질문 (연락 전 점검사항)</div>
        <ul style="margin: 0; padding-left: 20px; color: #475569; font-size: 0.9rem;">
            <li>{a.questions[0] if len(a.questions) > 0 else '특이사항 확인'}</li>
            <li>{a.questions[1] if len(a.questions) > 1 else '향후 일정 확인'}</li>
        </ul>
        <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed #CBD5E1; color: #64748B; font-size: 0.83rem; font-weight: 600;">
            ⚠️ 거래 이력만으로 이탈을 확정할 수 없습니다.
        </div>
    </div>
    """, unsafe_allow_html=True)

    # 간격 시각화 차트 및 최근 거래 10건
    col_chart, col_txns = st.columns([1, 1])
    with col_chart:
        st.markdown("<div style='font-weight: 700; color: #1E293B; font-size: 0.95rem; margin-bottom: 6px;'>📈 거래일별 간격 추이 (일 단위)</div>", unsafe_allow_html=True)
        if a.intervals:
            chart_df = pd.DataFrame({"간격(일)": a.intervals})
            st.bar_chart(chart_df, use_container_width=True)
            med_info = f"평소 간격(중앙값): {int(a.median_interval)}일" if a.median_interval else ""
            st.caption(f"{med_info} | 최근 {len(a.intervals)}개 거래 주기 차트")
        else:
            st.info("거래일 수가 부족하여 간격 차트를 표시할 수 없습니다.")

    with col_txns:
        st.markdown("<div style='font-weight: 700; color: #1E293B; font-size: 0.95rem; margin-bottom: 6px;'>📝 최근 거래 10건 내역</div>", unsafe_allow_html=True)
        if st.session_state.clean_df is not None:
            c_txns = st.session_state.clean_df[st.session_state.clean_df["customer_key"] == a.customer_key].sort_values("date", ascending=False).head(10)
            show_df = c_txns[["date", "amount", "item"]].rename(columns={"date": "거래일", "amount": "금액(원)", "item": "품목"})
            st.dataframe(show_df, use_container_width=True)

    st.markdown("<br><hr>", unsafe_allow_html=True)

    # -------------------------------------------------------------------------
    # 문안 준비: 이메일 초안 & 통화 가이드 (AI 초안)
    # -------------------------------------------------------------------------
    st.markdown("""
    <div style="font-size: 1.15rem; font-weight: 700; color: #1E293B; display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
        <span class="material-symbols-outlined" style="color: #2563EB;">edit_note</span>
        맞춤형 연락 문안 준비 (발송은 사용자가 직접 수행)
    </div>
    """, unsafe_allow_html=True)

    tab_mail, tab_call = st.tabs(["✉️ 이메일 초안", "📞 통화 가이드"])

    # 탭 1: 이메일 초안
    with tab_mail:
        col_cname, col_bgen, col_bgen_live = st.columns([2, 1.2, 1.2])
        with col_cname:
            contact_name = st.text_input("담당자명 (선택)", placeholder="예: 김철수 과장 (비워둘 시 [담당자명] 유지)", key=f"cname_{a.customer_key}")

        # 최신 초안 조회
        latest_draft = store.latest_draft(a.customer_key, "email")

        with col_bgen:
            st.markdown("<div style='height: 28px;'></div>", unsafe_allow_html=True)
            if st.button("✨ 이메일 초안 생성", key=f"btn_email_{a.customer_key}", use_container_width=True, type="primary"):
                with st.spinner("이메일 초안 준비 중..."):
                    res = llm.generate_email(a, demo_mode=st.session_state.demo_mode, force_live=False)
                    store.save_draft(a.customer_key, "email", res.source, res.content, st.session_state.ref_date.strftime("%Y-%m-%d"))
                    st.rerun()

        with col_bgen_live:
            st.markdown("<div style='height: 28px;'></div>", unsafe_allow_html=True)
            if st.button("🔄 새로 생성 (Live)", key=f"btn_email_live_{a.customer_key}", use_container_width=True):
                with st.spinner("라이브 API 실시간 호출 중..."):
                    res = llm.generate_email(a, demo_mode=st.session_state.demo_mode, force_live=True)
                    store.save_draft(a.customer_key, "email", res.source, res.content, st.session_state.ref_date.strftime("%Y-%m-%d"))
                    st.rerun()

        if latest_draft:
            src_text = "Liner Model API 응답" if latest_draft["source"] == "live" else ("Liner Model API 응답(저장본)" if latest_draft["source"] == "cache" else "기본 템플릿(폴백)")
            orig = latest_draft["original_json"]

            # 제목/본문 자리표시자 치환
            subject_rendered = llm.render_placeholders(orig.get("subject", ""), a.display_name, contact_name)
            initial_body = latest_draft.get("edited_text") or orig.get("body", "")
            body_rendered = llm.render_placeholders(initial_body, a.display_name, contact_name)

            st.markdown(f"""
            <div style="display: flex; gap: 8px; margin: 12px 0 6px 0;">
                <span class="source-tag" style="background: #EFF6FF; color: #1D4ED8; font-weight: 700;">AI 초안</span>
                <span class="source-tag">{src_text}</span>
            </div>
            """, unsafe_allow_html=True)

            st.text_input("메일 제목", value=subject_rendered, key=f"subj_{latest_draft['id']}")
            edited_body = st.text_area("메일 본문 (수정 가능)", value=body_rendered, height=180, key=f"body_{latest_draft['id']}")

            col_save, col_copy_guide = st.columns([1, 4])
            with col_save:
                if st.button("💾 수정본 저장", key=f"save_draft_{latest_draft['id']}", use_container_width=True):
                    store.update_draft_text(latest_draft["id"], edited_body)
                    st.success("수정본이 저장되었습니다.")

            st.markdown("<div style='font-size: 0.85rem; font-weight: 700; color: #475569; margin-top: 10px;'>📋 원클릭 복사 영역 (메일 프로그램에 붙여넣기)</div>", unsafe_allow_html=True)
            st.code(f"제목: {subject_rendered}\n\n{edited_body}", language="text")

    # 탭 2: 통화 가이드
    with tab_call:
        latest_call_draft = store.latest_draft(a.customer_key, "call")
        col_cgen, col_cgen_live, _ = st.columns([1.5, 1.5, 3])
        with col_cgen:
            if st.button("✨ 통화 가이드 생성", key=f"btn_call_{a.customer_key}", use_container_width=True, type="primary"):
                with st.spinner("통화 가이드 준비 중..."):
                    res = llm.generate_call_guide(a, demo_mode=st.session_state.demo_mode, force_live=False)
                    store.save_draft(a.customer_key, "call", res.source, res.content, st.session_state.ref_date.strftime("%Y-%m-%d"))
                    st.rerun()
        with col_cgen_live:
            if st.button("🔄 새로 생성 (Live)", key=f"btn_call_live_{a.customer_key}", use_container_width=True):
                with st.spinner("라이브 API 실시간 호출 중..."):
                    res = llm.generate_call_guide(a, demo_mode=st.session_state.demo_mode, force_live=True)
                    store.save_draft(a.customer_key, "call", res.source, res.content, st.session_state.ref_date.strftime("%Y-%m-%d"))
                    st.rerun()

        if latest_call_draft:
            src_text = "Liner Model API 응답" if latest_call_draft["source"] == "live" else ("Liner Model API 응답(저장본)" if latest_call_draft["source"] == "cache" else "기본 템플릿(폴백)")
            c_orig = latest_call_draft["original_json"]

            purpose = llm.render_placeholders(c_orig.get("purpose", ""), a.display_name)
            opening = llm.render_placeholders(c_orig.get("opening", ""), a.display_name)
            questions = [llm.render_placeholders(q, a.display_name) for q in c_orig.get("questions", [])]
            next_step = llm.render_placeholders(c_orig.get("next_step", ""), a.display_name)
            after_call = c_orig.get("after_call", [])

            st.markdown(f"""
            <div style="display: flex; gap: 8px; margin: 12px 0 6px 0;">
                <span class="source-tag" style="background: #EFF6FF; color: #1D4ED8; font-weight: 700;">AI 초안</span>
                <span class="source-tag">{src_text}</span>
            </div>
            <div class="flat-card" style="margin-top: 8px;">
                <div style="font-weight: 700; color: #1E293B; margin-bottom: 4px;">🎯 통화 목적</div>
                <div style="color: #475569; font-size: 0.9rem; margin-bottom: 12px;">{purpose}</div>

                <div style="font-weight: 700; color: #1E293B; margin-bottom: 4px;">👋 첫 인사 가이드</div>
                <div style="color: #475569; font-size: 0.9rem; margin-bottom: 12px; background: #F8FAFC; padding: 8px 12px; border-radius: 6px;">"{opening}"</div>

                <div style="font-weight: 700; color: #1E293B; margin-bottom: 4px;">❓ 주요 확인 질문</div>
                <ul style="color: #475569; font-size: 0.9rem; margin: 0 0 12px 0; padding-left: 20px;">
                    {''.join([f'<li>{q}</li>' for q in questions])}
                </ul>

                <div style="font-weight: 700; color: #1E293B; margin-bottom: 4px;">➡️ 다음 단계 제안</div>
                <div style="color: #475569; font-size: 0.9rem; margin-bottom: 12px;">{next_step}</div>

                <div style="font-weight: 700; color: #1E293B; margin-bottom: 4px;">📝 통화 후 기록 체크리스트</div>
                <ul style="color: #475569; font-size: 0.9rem; margin: 0; padding-left: 20px;">
                    {''.join([f'<li>{ac}</li>' for ac in after_call])}
                </ul>
            </div>
            """, unsafe_allow_html=True)

            call_summary_text = f"목적: {purpose}\n첫인사: {opening}\n질문: {', '.join(questions)}\n다음단계: {next_step}"
            st.code(call_summary_text, language="text")

    st.markdown("<br><hr>", unsafe_allow_html=True)

    # -------------------------------------------------------------------------
    # 접촉 기록 폼 & 이력 관리 (F11, M9)
    # -------------------------------------------------------------------------
    st.markdown("""
    <div style="font-size: 1.15rem; font-weight: 700; color: #1E293B; display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
        <span class="material-symbols-outlined" style="color: #10B981;">history_edu</span>
        거래처 접촉 결과 기록
    </div>
    """, unsafe_allow_html=True)

    with st.form(key=f"form_touch_{a.customer_key}"):
        tf1, tf2, tf3 = st.columns(3)
        with tf1:
            c_date = st.date_input("접촉 일자", value=st.session_state.ref_date)
        with tf2:
            c_channel = st.selectbox("접촉 채널", ["email", "phone", "other"], format_func=lambda x: {"email": "이메일", "phone": "전화", "other": "기타"}[x])
        with tf3:
            outcome_opts = [
                ("waiting_reply", "회신 대기"),
                ("planned", "연락 예정"),
                ("contacted", "연락 완료"),
                ("quote_requested", "견적 요청"),
                ("reorder_confirmed", "재주문 확인"),
                ("on_hold", "거래 보류"),
                ("not_needed", "연락 불필요")
            ]
            c_outcome = st.selectbox("접촉 결과", [opt[0] for opt in outcome_opts], format_func=lambda x: dict(outcome_opts)[x])

        c_note = st.text_input("접촉 메모 (최대 500자)", placeholder="예: 담당자 부재로 메일 발송 완료, 차주 화요일 일정 재확인 예정")

        tf_next1, tf_next2 = st.columns(2)
        with tf_next1:
            has_next = st.checkbox("다음 연락 예정일 지정", value=True)
            next_d = None
            if has_next:
                # 2.2 시나리오 디폴트: 2026-12-07 (접촉일로부터 7일 뒤)
                next_d = st.date_input("다음 연락일", value=date(2026, 12, 7))

        with tf_next2:
            draft_opts = [("(선택 안 함)", None)]
            if latest_draft:
                draft_opts.append((f"이메일 초안 #{latest_draft['id']}", latest_draft["id"]))
            draft_choice = st.selectbox("사용한 초안", [opt[0] for opt in draft_opts])
            sel_draft_id = dict(draft_opts)[draft_choice]

        submit_touch = st.form_submit_button("💾 접촉 기록 저장", type="primary", use_container_width=True)

        if submit_touch:
            if next_d and next_d < c_date:
                st.error("다음 연락일은 접촉 일자 이후여야 합니다.")
            else:
                try:
                    store.add_touchpoint(
                        customer_key=a.customer_key,
                        contact_date=c_date.strftime("%Y-%m-%d"),
                        channel=c_channel,
                        outcome=c_outcome,
                        note=c_note,
                        next_contact_date=next_d.strftime("%Y-%m-%d") if next_d else None,
                        draft_id=sel_draft_id
                    )
                    st.success(f"접촉 기록이 성공적으로 저장되었습니다. (다음 연락일: {next_d if next_d else '없음'})")
                    st.rerun()
                except Exception as e:
                    st.error(f"[E_DB] 데이터베이스 저장 중 오류가 발생했습니다: {e}")

    # 접촉 이력 표
    history = store.list_touchpoints(a.customer_key)
    if history:
        st.markdown("<div style='font-weight: 700; color: #1E293B; font-size: 0.95rem; margin: 16px 0 8px 0;'>📜 접촉 이력 내역 (최신순)</div>", unsafe_allow_html=True)
        h_rows = []
        out_dict = dict(outcome_opts)
        chan_dict = {"email": "이메일", "phone": "전화", "other": "기타"}
        for h in history:
            h_rows.append({
                "접촉일": h["contact_date"],
                "채널": chan_dict.get(h["channel"], h["channel"]),
                "결과": out_dict.get(h["outcome"], h["outcome"]),
                "메모": h["note"] or "",
                "다음 연락일": h["next_contact_date"] or "-",
                "기록 시각": h["created_at"]
            })
        st.dataframe(pd.DataFrame(h_rows), use_container_width=True)


# -----------------------------------------------------------------------------
# 7. 메인 라우팅
# -----------------------------------------------------------------------------
if st.session_state.page == "data":
    render_data_page()
elif st.session_state.page == "customer":
    render_customer_page()
else:
    render_dashboard_page()
