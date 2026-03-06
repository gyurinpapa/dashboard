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
      !email.trim() ||
      !password.trim() ||
      !passwordConfirm.trim() ||
      !signupType ||
      !division.trim() ||
      !department.trim() ||
      !team.trim()
    );
  }, [loading, email, password, passwordConfirm, signupType, division, department, team]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    setErrorText("");
    setSuccessText("");

    const emailTrimmed = email.trim().toLowerCase();
    const passwordTrimmed = password.trim();
    const passwordConfirmTrimmed = passwordConfirm.trim();

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
    }
  }

  return (
    <main style={{ display: "flex", justifyContent: "center" }}>
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
          }}
        >
          Automated Online Ads Reporting
        </h1>

        <div
          style={{
            background: "#f5a62333",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 20,
            padding: 32,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div style={{ width: "100%", maxWidth: 680 }}>
            <div
              style={{
                fontSize: 24,
                fontWeight: 900,
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              회원가입
            </div>

            <div
              style={{
                textAlign: "center",
                fontSize: 13,
                opacity: 0.7,
                marginBottom: 20,
              }}
            >
              회사 workspace에 소속 등록됩니다.
            </div>

            <form onSubmit={onSubmit}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 16,
                }}
              >
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ marginBottom: 6, fontSize: 13 }}>가입 유형</div>
                  <select
                    value={signupType}
                    onChange={(e) => setSignupType(e.target.value as SignupType)}
                    style={{
                      width: "100%",
                      padding: 14,
                      borderRadius: 12,
                      border: "1px solid #ddd",
                      background: "#eaf2ff",
                      fontSize: 16,
                    }}
                  >
                    <option value="internal">내부 사용자</option>
                    <option value="client">광고주</option>
                  </select>
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ marginBottom: 6, fontSize: 13 }}>이메일</div>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    style={{
                      width: "100%",
                      padding: 14,
                      borderRadius: 12,
                      border: "1px solid #ddd",
                      background: "#eaf2ff",
                      fontSize: 18,
                    }}
                  />
                </div>

                <div>
                  <div style={{ marginBottom: 6, fontSize: 13 }}>비밀번호</div>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="6자 이상 입력"
                    style={{
                      width: "100%",
                      padding: 14,
                      borderRadius: 12,
                      border: "1px solid #ddd",
                      background: "#eaf2ff",
                      fontSize: 18,
                    }}
                  />
                </div>

                <div>
                  <div style={{ marginBottom: 6, fontSize: 13 }}>비밀번호 확인</div>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    placeholder="비밀번호를 다시 입력"
                    style={{
                      width: "100%",
                      padding: 14,
                      borderRadius: 12,
                      border: "1px solid #ddd",
                      background: "#eaf2ff",
                      fontSize: 18,
                    }}
                  />
                </div>

                <div>
                  <div style={{ marginBottom: 6, fontSize: 13 }}>본부</div>
                  {signupType === "client" ? (
                    <input
                      value="외부"
                      readOnly
                      style={{
                        width: "100%",
                        padding: 14,
                        borderRadius: 12,
                        border: "1px solid #ddd",
                        background: "#f3f4f6",
                        fontSize: 16,
                      }}
                    />
                  ) : (
                    <select
                      value={division}
                      onChange={(e) => setDivision(e.target.value)}
                      style={{
                        width: "100%",
                        padding: 14,
                        borderRadius: 12,
                        border: "1px solid #ddd",
                        background: "#eaf2ff",
                        fontSize: 16,
                      }}
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
                  <div style={{ marginBottom: 6, fontSize: 13 }}>부서</div>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    disabled={signupType === "client"}
                    style={{
                      width: "100%",
                      padding: 14,
                      borderRadius: 12,
                      border: "1px solid #ddd",
                      background: signupType === "client" ? "#f3f4f6" : "#eaf2ff",
                      fontSize: 16,
                    }}
                  >
                    {departmentOptions.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={{ marginBottom: 6, fontSize: 13 }}>팀</div>
                  <select
                    value={team}
                    onChange={(e) => setTeam(e.target.value)}
                    disabled={signupType === "client"}
                    style={{
                      width: "100%",
                      padding: 14,
                      borderRadius: 12,
                      border: "1px solid #ddd",
                      background: signupType === "client" ? "#f3f4f6" : "#eaf2ff",
                      fontSize: 16,
                    }}
                  >
                    {teamOptions.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={{ marginBottom: 6, fontSize: 13 }}>가입 후 기본 역할</div>
                  <input
                    value={effectiveRole}
                    readOnly
                    style={{
                      width: "100%",
                      padding: 14,
                      borderRadius: 12,
                      border: "1px solid #ddd",
                      background: "#f3f4f6",
                      fontSize: 16,
                    }}
                  />
                </div>
              </div>

              {!!errorText && (
                <div className="infoMsg errorBox" style={{ marginTop: 14 }}>
                  {errorText}
                </div>
              )}

              {!!successText && (
                <div className="infoMsg" style={{ marginTop: 14 }}>
                  {successText}
                </div>
              )}

              <button type="submit" className="mainBtn" disabled={disabled} style={{ marginTop: 16 }}>
                {loading ? "회원가입 중..." : "회원가입"}
              </button>
            </form>

            <Link href="/report-builder" className="signupBtn" style={{ marginTop: 12 }}>
              로그인으로 돌아가기
            </Link>
          </div>
        </div>

        <style jsx>{`
          .mainBtn {
            width: 100%;
            padding: 14px;
            border-radius: 14px;
            border: none;
            background: black;
            color: white;
            font-weight: 800;
            cursor: pointer;
            box-shadow: 0 10px 18px rgba(0, 0, 0, 0.15);
            transition: 0.15s;
            text-align: center;
          }

          .mainBtn:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 14px 22px rgba(0, 0, 0, 0.18);
          }

          .mainBtn:disabled {
            cursor: not-allowed;
            opacity: 0.6;
          }

          .signupBtn {
            width: 100%;
            padding: 14px;
            border-radius: 14px;
            border: 1px solid #ddd;
            background: rgba(255, 255, 255, 0.9);
            color: black;
            font-weight: 800;
            cursor: pointer;
            transition: 0.15s;
            text-align: center;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 10px 18px rgba(0, 0, 0, 0.05);
          }

          .signupBtn:hover {
            transform: translateY(-1px);
            box-shadow: 0 14px 22px rgba(0, 0, 0, 0.08);
          }

          .infoMsg {
            padding: 12px 14px;
            border-radius: 12px;
            border: 1px solid #eee;
            background: white;
            font-size: 14px;
            white-space: pre-wrap;
            word-break: break-word;
          }

          .errorBox {
            border-color: #f3d4d4;
            background: #fff7f7;
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