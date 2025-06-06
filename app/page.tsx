"use client";

import { useState, useEffect, useMemo } from "react";

export default function Home() {
  type Domain = {
    name: string;
    domainType: string;
    attributes: { name: string; type: string }[];
    methods?: { name: string; inputs: string; output: string }[];
  };
  const [projectName, setProjectName] = useState("");
  const [language, setLanguage] = useState("typescript");
  const [domains, setDomains] = useState<Domain[]>([]);
  const [usecases, setUsecases] = useState([
    {
      name: "",
      inputFields: [{ name: "" }],
      outputFields: [{ name: "" }]
    }
  ]);

  useEffect(() => {
    if (domains.length === 0) {
      setDomains([
        {
          name: "",
          domainType: "entity",
          attributes: [{ name: "", type: "" }],
          methods: []
        }
      ]);
    }
  }, []);

  const validateAlphanumeric = (value: string) => {
    if (!value.trim() || /^[^a-zA-Z0-9]*$/.test(value)) {
      return false;
    }
    return /^[a-zA-Z0-9_]*$/.test(value);
  };

  const addDomain = () => {
    setDomains([
      ...domains,
      {
        name: "",
        domainType: "entity",
        attributes: [{ name: "", type: "" }],
        methods: []
      }
    ]);
  };

  const addUsecase = () => {
    setUsecases([
      ...usecases,
      {
        name: "",
        inputFields: [{ name: "" }],
        outputFields: [{ name: "" }]
      }
    ]);
  };

  // ドメイン名と属性名が空白や記号のみの場合は除外
  const isValidName = (name: string) => {
    return name.trim() !== "" && /[a-zA-Z0-9_]/.test(name);
  };

  const domainOptions = useMemo(
    () => domains.map((d) => d.name).filter(isValidName),
    [domains]
  );
  const attributeOptions = useMemo(
    () =>
      domains
        .flatMap((d) => d.attributes.map((a) => a.name))
        .filter(isValidName),
    [domains]
  );
  const selectionOptions = useMemo(
    () => Array.from(new Set([...domainOptions, ...attributeOptions])),
    [domainOptions, attributeOptions]
  );

  const handleSubmit = async () => {
    // 入力値の検証
    if (!projectName.trim()) {
      alert('プロジェクト名を入力してください');
      return;
    }
    for (const domain of domains) {
      if (!domain.name.trim()) {
        alert('ドメイン名を入力してください');
        return;
      }
      for (const attr of domain.attributes) {
        if (!attr.name.trim() || !attr.type.trim()) {
          alert('属性の名前と型を入力してください');
          return;
        }
      }
      for (const method of domain.methods || []) {
        if (!method.name.trim()) {
          alert('メソッド名を入力してください');
          return;
        }
      }
    }
    for (const usecase of usecases) {
      if (!usecase.name.trim()) {
        alert('ユースケース名を入力してください');
        return;
      }
    }
    // APIにPOSTしてzipをダウンロード
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName, language, domains, usecases })
    });
    if (!res.ok) {
      alert('プロジェクト生成に失敗しました');
      return;
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'project.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-zinc-950 text-white flex flex-col font-sans">
      <header className="bg-zinc-900 px-8 py-5 shadow-md border-b border-zinc-700 flex justify-between items-center">
        <h1 className="text-3xl font-extrabold tracking-wide">ArchForge</h1>
        <span className="text-sm text-zinc-400">Clean Architecture Project Generator</span>
      </header>

      <main className="flex-1 px-6 sm:px-10 md:px-20 py-12 flex flex-col gap-14">
        <section>
          <h2 className="text-3xl font-bold mb-6">プロジェクト設定</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <label className="flex flex-col gap-2">
              <span className="font-medium text-sm">プロジェクト名</span>
              <input
                className="border border-zinc-700 bg-zinc-800 p-3 rounded text-base placeholder-zinc-500"
                placeholder="例: OrderManagementSystem"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="font-medium text-sm">使用するプログラミング言語</span>
              <select
                className="border border-zinc-700 bg-zinc-800 p-3 rounded text-base"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="typescript">TypeScript</option>
                <option value="go">Go</option>
                <option value="python">Python</option>
                <option value="ruby">Ruby</option>
                <option value="java">Java</option>
              </select>
            </label>
          </div>
        </section>

        <section>
          <h2 className="text-3xl font-semibold mb-4">ドメインモデル定義</h2>
          <p className="text-sm text-zinc-400 mb-6">ドメインオブジェクトや振る舞いを定義してください（エンティティ・値オブジェクト・ドメインサービス）。</p>

          <div className="flex flex-col gap-6">
            {domains.map((domain, domainIndex) => (
              <div key={domainIndex} className="border border-zinc-700 bg-zinc-900 p-6 rounded-xl flex flex-col gap-5 shadow-md">
                <div className="flex justify-between items-center">
                  <div className="grid md:grid-cols-2 gap-4 flex-grow">
                    <input
                      className="border border-zinc-700 bg-zinc-800 p-2 rounded text-base"
                      placeholder="ドメイン名（例: Order）"
                      value={domain.name}
                      onChange={(e) => {
                        const updated = [...domains];
                        updated[domainIndex].name = e.target.value;
                        setDomains(updated);
                      }}
                    />
                    <select
                      className="border border-zinc-700 bg-zinc-800 p-2 rounded text-base"
                      value={domain.domainType}
                      onChange={(e) => {
                        const updated = [...domains];
                        updated[domainIndex].domainType = e.target.value;
                        setDomains(updated);
                      }}
                    >
                      <option value="entity">エンティティ</option>
                      <option value="valueObject">値オブジェクト</option>
                      <option value="domainService">ドメインサービス</option>
                    </select>
                  </div>
                  <button
                    className="bg-zinc-700 hover:bg-zinc-600 text-red-400 text-xs px-3 py-2 rounded ml-4 flex-shrink-0"
                    onClick={() => {
                      const updated = domains.filter((_, index) => index !== domainIndex);
                      setDomains(updated);
                    }}
                  >
                    ドメイン削除
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-zinc-300">属性</span>
                  {domain.attributes.map((attr, i) => (
                    <div key={i} className="flex gap-3">
                      <input
                        placeholder="name"
                        className="border border-zinc-700 bg-zinc-800 p-2 rounded w-1/2"
                        value={attr.name}
                        onChange={(e) => {
                          const updated = [...domains];
                          updated[domainIndex].attributes[i].name = e.target.value;
                          setDomains(updated);
                        }}
                      />
                      <input
                        placeholder="type"
                        className="border border-zinc-700 bg-zinc-800 p-2 rounded w-1/2"
                        value={attr.type}
                        onChange={(e) => {
                          const updated = [...domains];
                          updated[domainIndex].attributes[i].type = e.target.value;
                          setDomains(updated);
                        }}
                      />
                      <button
                        className="bg-zinc-700 hover:bg-zinc-600 text-red-400 text-xs px-2 py-1 rounded flex-shrink-0"
                        onClick={() => {
                          const updated = [...domains];
                          updated[domainIndex].attributes = updated[domainIndex].attributes.filter((_, attributeIndex) => attributeIndex !== i);
                          setDomains(updated);
                        }}
                      >
                        削除
                      </button>
                    </div>
                  ))}
                  <button
                    className="text-xs text-blue-400 mt-1 hover:underline"
                    onClick={() => {
                      const updated = [...domains];
                      updated[domainIndex].attributes.push({ name: "", type: "" });
                      setDomains(updated);
                    }}
                  >
                    + 属性を追加
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-zinc-300">メソッド</span>
                  {domain.methods?.map((m, i) => (
                    <div key={i} className="flex gap-3">
                      <input
                        placeholder="name"
                        className="border border-zinc-700 bg-zinc-800 p-2 rounded w-1/3"
                        value={m.name}
                        onChange={(e) => {
                          const updated = [...domains];
                          if (!updated[domainIndex].methods) {
                            updated[domainIndex].methods = [];
                          }
                          updated[domainIndex].methods[i].name = e.target.value;
                          setDomains(updated);
                        }}
                      />
                      <select
                        className="border border-zinc-700 bg-zinc-800 p-2 rounded w-1/3"
                        value={m.inputs}
                        onChange={(e) => {
                          const updated = [...domains];
                          if (!updated[domainIndex].methods) {
                            updated[domainIndex].methods = [];
                          }
                          updated[domainIndex].methods[i].inputs = e.target.value;
                          setDomains(updated);
                        }}
                      >
                        <option value="">入力の型を選択</option>
                        {selectionOptions.map((option, idx) => (
                          <option key={idx} value={option}>{option}</option>
                        ))}
                      </select>
                      <select
                        className="border border-zinc-700 bg-zinc-800 p-2 rounded w-1/3"
                        value={m.output}
                        onChange={(e) => {
                          const updated = [...domains];
                          if (!updated[domainIndex].methods) {
                            updated[domainIndex].methods = [];
                          }
                          updated[domainIndex].methods[i].output = e.target.value;
                          setDomains(updated);
                        }}
                      >
                        <option value="">出力の型を選択</option>
                        {selectionOptions.map((option, idx) => (
                          <option key={idx} value={option}>{option}</option>
                        ))}
                      </select>
                      <button
                        className="bg-zinc-700 hover:bg-zinc-600 text-red-400 text-xs px-2 py-1 rounded flex-shrink-0"
                        onClick={() => {
                          const updated = [...domains];
                          updated[domainIndex].methods = updated[domainIndex].methods?.filter((_, methodIndex) => methodIndex !== i) || [];
                          setDomains(updated);
                        }}
                      >
                        削除
                      </button>
                    </div>
                  ))}
                  <button
                    className="text-xs text-blue-400 mt-1 hover:underline"
                    onClick={() => {
                      const updated = [...domains];
                      if (!updated[domainIndex].methods) {
                        updated[domainIndex].methods = [];
                      }
                      updated[domainIndex].methods.push({ name: "", inputs: "", output: "" });
                      setDomains(updated);
                    }}
                  >
                    + メソッドを追加
                  </button>
                </div>
              </div>
            ))}
            <button
              className="text-sm text-green-400 border border-green-600 py-2 px-4 rounded hover:bg-green-600/10 mt-2 w-fit"
              onClick={addDomain}
            >
              + ドメインを追加
            </button>
          </div>
        </section>

        <section>
          <h2 className="text-3xl font-semibold mb-4">ユースケース定義</h2>
          <p className="text-sm text-zinc-400 mb-6">入力・出力として必要なドメインオブジェクトを選択してください。</p>

          <div className="flex flex-col gap-6">
            {usecases.map((u, i) => (
              <div key={i} className="border border-zinc-700 bg-zinc-900 p-6 rounded-xl flex flex-col gap-4 shadow-md">
                <div className="flex justify-between items-center">
                  <input
                    className="border border-zinc-700 bg-zinc-800 p-2 rounded text-base flex-grow"
                    placeholder="ユースケース名（例: PlaceOrder）"
                    value={u.name}
                    onChange={(e) => {
                      const updated = [...usecases];
                      updated[i].name = e.target.value;
                      setUsecases(updated);
                    }}
                  />
                  <button
                    className="bg-zinc-700 hover:bg-zinc-600 text-red-400 text-xs px-3 py-2 rounded ml-4 flex-shrink-0"
                    onClick={() => {
                      const updated = usecases.filter((_, index) => index !== i);
                      setUsecases(updated);
                    }}
                  >
                    ユースケース削除
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">入力</span>
                  {u.inputFields.map((f, fi) => (
                    <div key={fi} className="flex gap-3 items-center">
                      <select
                        className="border border-zinc-700 bg-zinc-800 p-2 rounded text-sm flex-grow"
                        value={f.name}
                        onChange={(e) => {
                          const updated = [...usecases];
                          updated[i].inputFields[fi].name = e.target.value;
                          setUsecases(updated);
                        }}
                      >
                        <option value="">選択</option>
                        {selectionOptions.map((field, idx) => (
                          <option key={idx} value={field}>{field}</option>
                        ))}
                      </select>
                      <button
                        className="bg-zinc-700 hover:bg-zinc-600 text-red-400 text-xs px-2 py-1 rounded flex-shrink-0"
                        onClick={() => {
                          const updated = [...usecases];
                          updated[i].inputFields = updated[i].inputFields.filter((_, inputIndex) => inputIndex !== fi);
                          setUsecases(updated);
                        }}
                      >
                        削除
                      </button>
                    </div>
                  ))}
                  <button
                    className="text-xs text-blue-400 hover:underline"
                    onClick={() => {
                      const updated = [...usecases];
                      updated[i].inputFields.push({ name: "" });
                      setUsecases(updated);
                    }}
                  >
                    + 入力を追加
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">出力</span>
                  {u.outputFields.map((f, fi) => (
                    <div key={fi} className="flex gap-3 items-center">
                      <select
                        className="border border-zinc-700 bg-zinc-800 p-2 rounded text-sm flex-grow"
                        value={f.name}
                        onChange={(e) => {
                          const updated = [...usecases];
                          updated[i].outputFields[fi].name = e.target.value;
                          setUsecases(updated);
                        }}
                      >
                        <option value="">選択</option>
                        {selectionOptions.map((field, idx) => (
                          <option key={idx} value={field}>{field}</option>
                        ))}
                      </select>
                      <button
                        className="bg-zinc-700 hover:bg-zinc-600 text-red-400 text-xs px-2 py-1 rounded flex-shrink-0"
                        onClick={() => {
                          const updated = [...usecases];
                          updated[i].outputFields = updated[i].outputFields.filter((_, outputIndex) => outputIndex !== fi);
                          setUsecases(updated);
                        }}
                      >
                        削除
                      </button>
                    </div>
                  ))}
                  <button
                    className="text-xs text-blue-400 hover:underline"
                    onClick={() => {
                      const updated = [...usecases];
                      updated[i].outputFields.push({ name: "" });
                      setUsecases(updated);
                    }}
                  >
                    + 出力を追加
                  </button>
                </div>
              </div>
            ))}
            <button
              className="text-sm text-green-400 border border-green-600 py-2 px-4 rounded hover:bg-green-600/10 mt-2 w-fit"
              onClick={addUsecase}
            >
              + ユースケースを追加
            </button>
          </div>
        </section>

        <div className="text-center mt-12">
          <button
            className="bg-white text-black px-10 py-3 rounded-lg text-lg font-bold shadow-md hover:bg-zinc-100 transition"
            onClick={handleSubmit}
          >
            プロジェクト生成
          </button>
        </div>
      </main>

      <footer className="bg-zinc-900 text-zinc-500 text-center py-6 text-sm border-t border-zinc-700">
        © 2025 ArchForge — Clean Architecture Generator
      </footer>
    </div>
  );
}