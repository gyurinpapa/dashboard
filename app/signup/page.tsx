// app/signup/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabase/client";

type SignupType = "internal" | "client";

type ApiRes = {
  ok?: boolean;
  error?: string;
  detail?: string;
};

const DIVISION_OPTIONS = ["광고본부", "미디어사업부"] as const;

const DEPARTMENT_BY_DIVISION: Record<string, string[]> = {
  광고본부: ["광고1부", "광고2부", "광고3부"],
  미디어사업부: ["미디어사업부"],
};

const TEAM_BY_DEPARTMENT: Record<string, string[]> = {
  광고1부: ["1팀", "2팀", "3팀", "4팀", "5팀", "6팀", "7팀", "8팀", "9팀"],
  광고2부: ["1팀", "2팀", "3팀", "4팀", "5팀", "6팀", "7팀", "8팀", "9팀"],
  광고3부: ["1팀", "2팀", "3팀", "4팀", "5팀", "6팀", "7팀", "8팀", "9팀"],
  미디어사업부: ["미디어팀"],
};

async function safeJson(res: Response): Promise<ApiRes | null> {
  const raw = await res.text().catch(() => "");
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return { ok: false, error: "NON_JSON_RESPONSE", detail: raw };
  }
}

function humanError(error?: string, detail?: string) {
  const suffix = detail ? ` (${detail})` : "";

  switch (error) {
    case "FULL_NAME_REQUIRED":
      return "이름을 입력해주세요.";
    case "EMAIL_REQUIRED":
      return "이메일을 입력해주세요.";
    case "PASSWORD_REQUIRED":
      return "비밀번호를 입력해주세요.";
    case "PASSWORD_TOO_SHORT":
      return "비밀번호는 6자 이상이어야 합니다.";
    case "PASSWORD_CONFIRM_MISMATCH":
      return "비밀번호 확인이 일치하지 않습니다.";
    case "SIGNUP_TYPE_REQUIRED":
      return "가입 유형을 선택해주세요.";
    case "DIVISION_REQUIRED":
      return "본부를 선택해주세요.";
    case "DEPARTMENT_REQUIRED":
      return "부서를 선택해주세요.";
    case "TEAM_REQUIRED":
      return "팀을 선택해주세요.";
    case "EMAIL_ALREADY_EXISTS":
      return "이미 가입된 이메일입니다." + suffix;
    case "AUTH_USER_CREATE_FAILED":
      return "회원가입 중 계정 생성에 실패했습니다." + suffix;
    case "PROFILE_UPSERT_FAILED":
      return "회원가입 중 프로필 저장에 실패했습니다." + suffix;
    case "WORKSPACE_MEMBER_CREATE_FAILED":
      return "회원가입 중 소속 등록에 실패했습니다." + suffix;
    case "COMPANY_WORKSPACE_ID_MISSING":
      return "회사 workspace 설정이 없습니다." + suffix;
    case "SUPABASE_ENV_MISSING":
      return "서버 환경변수가 누락되었습니다." + suffix;
    case "INTERNAL_SERVER_ERROR":
      return "서버 내부 오류가 발생했습니다." + suffix;
    default:
      return (error || "회원가입 중 오류가 발생했습니다.") + suffix;
  }
}

export default function SignupPage() {
  const router = useRouter();

  const [signupType, setSignupType] = useState<SignupType>("internal");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const [division, setDivision] = useState<string>("광고본부");
  const [department, setDepartment] = useState<string>("광고1부");
  const [team, setTeam] = useState<string>("1팀");

  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");

  const departmentOptions = useMemo(() => {
    if (signupType === "client") return ["광고주"];
    return DEPARTMENT_BY_DIVISION[division] ?? [];
  }, [signupType, division]);

  const teamOptions = useMemo(() => {
    if (signupType === "client") return ["광고주"];
    return TEAM_BY_DEPARTMENT[department] ?? [];
  }, [signupType, department]);

  useEffect(() => {
    if (signupType === "client") {
      setDivision("외부");
      setDepartment("광고주");
      setTeam("광고주");
      return;
    }

    if (!DIVISION_OPTIONS.includes(division as any)) {
      setDivision("광고본부");
      return;
    }

    const nextDepartments = DEPARTMENT_BY_DIVISION[division] ?? [];
    if (!nextDepartments.includes(department)) {
      setDepartment(nextDepartments[0] ?? "");
      return;
    }

    const nextTeams = TEAM_BY_DEPARTMENT[department] ?? [];
    if (!nextTeams.includes(team)) {
      setTeam(nextTeams[0] ?? "");
    }
  }, [signupType, division, department, team]);

  const effectiveRole = signupType === "client" ? "client" : "staff";

  const disabled = useMemo(() => {
    return (
      loading ||
      !fullName.trim() ||
      !email.trim() ||
      !password.trim() ||
      !passwordConfirm.trim() ||
      !signupType ||
      !division.trim() ||
      !department.trim() ||
      !team.trim()
    );
  }, [
    loading,
    fullName,
    email,
    password,
    passwordConfirm,
    signupType,
    division,
    department,
    team,
  ]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    setErrorText("");
    setSuccessText("");

    const fullNameTrimmed = fullName.trim();
    const emailTrimmed = email.trim().toLowerCase();
    const passwordTrimmed = password.trim();
    const passwordConfirmTrimmed = passwordConfirm.trim();

    if (!fullNameTrimmed) {
      setErrorText("이름을 입력해주세요.");
      return;
    }

    if (!emailTrimmed) {
      setErrorText("이메일을 입력해주세요.");
      return;
    }

    if (!passwordTrimmed) {
      setErrorText("비밀번호를 입력해주세요.");
      return;
    }

    if (passwordTrimmed.length < 6) {
      setErrorText("비밀번호는 6자 이상이어야 합니다.");
      return;
    }

    if (passwordTrimmed !== passwordConfirmTrimmed) {
      setErrorText("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    if (!signupType) {
      setErrorText("가입 유형을 선택해주세요.");
      return;
    }

    if (!division.trim()) {
      setErrorText("본부를 선택해주세요.");
      return;
    }

    if (!department.trim()) {
      setErrorText("부서를 선택해주세요.");
      return;
    }

    if (!team.trim()) {
      setErrorText("팀을 선택해주세요.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          full_name: fullNameTrimmed,
          email: emailTrimmed,
          password: passwordTrimmed,
          passwordConfirm: passwordConfirmTrimmed,
          signup_type: signupType,
          division,
          department,
          team,
        }),
      });

      const data = await safeJson(res);

      if (!res.ok || !data?.ok) {
        setErrorText(humanError(data?.error, data?.detail));
        setLoading(false);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: emailTrimmed,
        password: passwordTrimmed,
      });

      if (signInError) {
        setErrorText(
          `회원가입은 완료되었지만 자동 로그인에 실패했습니다. (${signInError.message})`
        );
        setLoading(false);
        return;
      }

      setSuccessText("회원가입이 완료되었습니다. 이동 중입니다...");
      router.replace("/report-builder");
      router.refresh();
    } catch (err: any) {
      setErrorText(err?.message || "회원가입 처리 중 오류가 발생했습니다.");
      setLoading(false);
      return;
    }
  }

  return (
    <main
      style={{
        display: "flex",
        justifyContent: "center",
        background: "#f3f4f6",
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 1200,
          padding: 24,
        }}
      >
        <h1
          style={{
            fontSize: 36,
            fontWeight: 900,
            textAlign: "center",
            marginBottom: 20,
            color: "#111827",
            letterSpacing: "-0.02em",
          }}
        >
          Automated Online Ads Reporting
        </h1>

        <div
          style={{
            background: "#e5e7eb",
            border: "1px solid #cfd4dc",
            borderRadius: 24,
            padding: 32,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            boxShadow:
              "18px 18px 36px rgba(55, 65, 81, 0.14), -12px -12px 24px rgba(255, 255, 255, 0.82)",
          }}
        >
          <div style={{ width: "100%", maxWidth: 720 }}>
            <div
              style={{
                fontSize: 26,
                fontWeight: 900,
                textAlign: "center",
                marginBottom: 8,
                color: "#111827",
                letterSpacing: "-0.02em",
              }}
            >
              회원가입
            </div>

            <div
              style={{
                color: "#4b5563",
                textAlign: "center",
                fontSize: 15,
                lineHeight: 1.6,
                marginBottom: 24,
              }}
            >
              회사 workspace에 소속 등록됩니다.
            </div>

            <form onSubmit={onSubmit}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 18,
                }}
              >
                <div style={{ gridColumn: "1 / -1" }}>
                  <div className="fieldLabel">가입 유형</div>
                  <select
                    value={signupType}
                    onChange={(e) => setSignupType(e.target.value as SignupType)}
                    className="neoField"
                  >
                    <option value="internal">내부 사용자</option>
                    <option value="client">광고주</option>
                  </select>
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <div className="fieldLabel">이름</div>
                  <input
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="이름을 입력하세요"
                    className="neoField"
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <div className="fieldLabel">이메일</div>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="neoField"
                  />
                </div>

                <div>
                  <div className="fieldLabel">비밀번호</div>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="6자 이상 입력"
                    className="neoField"
                  />
                </div>

                <div>
                  <div className="fieldLabel">비밀번호 확인</div>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    placeholder="비밀번호를 다시 입력"
                    className="neoField"
                  />
                </div>

                <div>
                  <div className="fieldLabel">본부</div>
                  {signupType === "client" ? (
                    <input value="외부" readOnly className="neoField neoFieldDisabled" />
                  ) : (
                    <select
                      value={division}
                      onChange={(e) => setDivision(e.target.value)}
                      className="neoField"
                    >
                      {DIVISION_OPTIONS.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <div className="fieldLabel">부서</div>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    disabled={signupType === "client"}
                    className={`neoField ${signupType === "client" ? "neoFieldDisabled" : ""}`}
                  >
                    {departmentOptions.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="fieldLabel">팀</div>
                  <select
                    value={team}
                    onChange={(e) => setTeam(e.target.value)}
                    disabled={signupType === "client"}
                    className={`neoField ${signupType === "client" ? "neoFieldDisabled" : ""}`}
                  >
                    {teamOptions.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="fieldLabel">가입 후 기본 역할</div>
                  <input value={effectiveRole} readOnly className="neoField neoFieldDisabled" />
                </div>
              </div>

              {!!errorText && (
                <div className="infoMsg errorBox" style={{ marginTop: 16 }}>
                  {errorText}
                </div>
              )}

              {!!successText && (
                <div className="infoMsg" style={{ marginTop: 16 }}>
                  {successText}
                </div>
              )}

              <button
                type="submit"
                className="mainBtn"
                disabled={disabled}
                style={{ marginTop: 18 }}
              >
                {loading ? "회원가입 중..." : "회원가입"}
              </button>
            </form>

            <div
              style={{
                marginTop: 14,
                display: "flex",
                justifyContent: "center",
              }}
            >
              <Link href="/report-builder" className="signupBtn">
                로그인으로 돌아가기
              </Link>
            </div>
          </div>
        </div>

        <style jsx>{`
          .fieldLabel {
            margin-bottom: 8px;
            font-size: 15px;
            font-weight: 800;
            color: #1f2937;
            letter-spacing: 0.01em;
          }

          .neoField {
            width: 100%;
            padding: 16px;
            border-radius: 16px;
            border: 1px solid #bfc6cf;
            outline: none;
            background: linear-gradient(145deg, #f8fafc, #d9dde3);
            color: #111827;
            font-size: 17px;
            font-weight: 600;
            box-shadow:
              inset 1px 1px 0 rgba(255, 255, 255, 0.95),
              inset -1px -1px 0 rgba(148, 163, 184, 0.28),
              8px 8px 16px rgba(107, 114, 128, 0.14),
              -6px -6px 12px rgba(255, 255, 255, 0.9);
            transition: box-shadow 0.15s ease, transform 0.15s ease,
              border-color 0.15s ease;
            appearance: none;
            -webkit-appearance: none;
          }

          .neoField::placeholder {
            color: #6b7280;
            font-weight: 500;
          }

          .neoField:focus {
            border-color: #6b7280;
            box-shadow:
              inset 1px 1px 0 rgba(255, 255, 255, 0.98),
              inset -1px -1px 0 rgba(148, 163, 184, 0.24),
              0 0 0 2px rgba(55, 65, 81, 0.12),
              8px 8px 16px rgba(107, 114, 128, 0.16),
              -6px -6px 12px rgba(255, 255, 255, 0.92);
          }

          .neoFieldDisabled {
            color: #4b5563;
            background: linear-gradient(145deg, #eceff3, #d7dbe1);
            border-color: #c7cdd6;
            cursor: not-allowed;
          }

          .mainBtn {
            width: 100%;
            padding: 16px;
            border-radius: 18px;
            border: 1px solid #374151;
            background: linear-gradient(145deg, #374151, #111827);
            color: #f9fafb;
            font-weight: 900;
            font-size: 17px;
            cursor: pointer;
            box-shadow:
              10px 10px 20px rgba(75, 85, 99, 0.22),
              -6px -6px 12px rgba(255, 255, 255, 0.38);
            transition: 0.15s ease;
            text-align: center;
            letter-spacing: 0.01em;
          }

          .mainBtn:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow:
              12px 12px 22px rgba(75, 85, 99, 0.24),
              -6px -6px 12px rgba(255, 255, 255, 0.4);
          }

          .mainBtn:active:not(:disabled) {
            transform: translateY(0);
            box-shadow:
              inset 4px 4px 8px rgba(17, 24, 39, 0.28),
              inset -2px -2px 6px rgba(255, 255, 255, 0.08);
          }

          .mainBtn:disabled {
            cursor: not-allowed;
            opacity: 0.6;
          }

          .signupBtn {
            min-width: 220px;
            padding: 12px 18px;
            border-radius: 16px;
            border: 1px solid #c2c8d0;
            background: linear-gradient(145deg, #f8fafc, #dde2e8);
            color: #111827;
            font-weight: 800;
            font-size: 15px;
            cursor: pointer;
            transition: 0.15s ease;
            text-align: center;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            box-shadow:
              8px 8px 18px rgba(107, 114, 128, 0.14),
              -6px -6px 14px rgba(255, 255, 255, 0.88);
          }

          .signupBtn:hover {
            transform: translateY(-1px);
          }

          .infoMsg {
            padding: 13px 15px;
            border-radius: 14px;
            border: 1px solid #d1d5db;
            background: linear-gradient(145deg, #f9fafb, #eceff3);
            font-size: 14px;
            white-space: pre-wrap;
            word-break: break-word;
            color: #111827;
            box-shadow:
              8px 8px 16px rgba(107, 114, 128, 0.12),
              -6px -6px 12px rgba(255, 255, 255, 0.88);
          }

          .errorBox {
            border-color: #e5b9b9;
            background: linear-gradient(145deg, #fff7f7, #fbe9e9);
            color: #b42318;
          }

          @media (max-width: 860px) {
            form > div:first-child {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>
    </main>
  );
}