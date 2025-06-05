"use client";

import { useState } from "react";

export default function Home() {
  const [projectName, setProjectName] = useState("");
  const [language, setLanguage] = useState("typescript");
  const [domains, setDomains] = useState([
    {
      name: "",
      domainType: "entity",
      attributes: [{ name: "", type: "" }],
      methods: [{ name: "", inputs: "", output: "" }]
    }
  ]);
  const [usecases, setUsecases] = useState([
    {
      name: "",
      inputFields: [{ name: "" }],
      outputFields: [{ name: "" }]
    }
  ]);

  const addDomain = () => {
    setDomains([
      ...domains,
      {
        name: "",
        domainType: "entity",
        attributes: [{ name: "", type: "" }],
        methods: [{ name: "", inputs: "", output: "" }]
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

  const domainOptions = domains.map((d) => d.name);

  const handleSubmit = () => {
    // POST to backend to generate project
  };

  return (
    <div className="min-h-screen p-8 sm:p-20 flex flex-col gap-8">
      <h1 className="text-2xl font-bold">ArchForge プロジェクト生成</h1>

      <label className="flex flex-col gap-2">
        <span>プロジェクト名</span>
        <input
          className="border p-2 rounded"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span>使用するプログラミング言語</span>
        <select
          className="border p-2 rounded"
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

      <h2 className="text-xl font-semibold mt-8">ドメインモデル定義</h2>

      {domains.map((domain, domainIndex) => (
        <div key={domainIndex} className="border p-4 rounded-md flex flex-col gap-4 bg-zinc-900">
          <label className="flex flex-col gap-2">
            <span>ドメイン名</span>
            <input
              className="border p-2 rounded"
              value={domain.name}
              onChange={(e) => {
                const updated = [...domains];
                updated[domainIndex].name = e.target.value;
                setDomains(updated);
              }}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span>ドメイン種別</span>
            <select
              className="border p-2 rounded"
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
          </label>

          <div className="flex flex-col gap-2">
            <span>属性</span>
            {domain.attributes.map((attr, i) => (
              <div key={i} className="flex gap-2">
                <input
                  placeholder="name"
                  className="border p-1 rounded"
                  value={attr.name}
                  onChange={(e) => {
                    const updated = [...domains];
                    updated[domainIndex].attributes[i].name = e.target.value;
                    setDomains(updated);
                  }}
                />
                <input
                  placeholder="type"
                  className="border p-1 rounded"
                  value={attr.type}
                  onChange={(e) => {
                    const updated = [...domains];
                    updated[domainIndex].attributes[i].type = e.target.value;
                    setDomains(updated);
                  }}
                />
              </div>
            ))}
            <button
              className="text-sm text-blue-600"
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
            <span>メソッド</span>
            {domain.methods.map((m, i) => (
              <div key={i} className="flex gap-2">
                <input
                  placeholder="name"
                  className="border p-1 rounded"
                  value={m.name}
                  onChange={(e) => {
                    const updated = [...domains];
                    updated[domainIndex].methods[i].name = e.target.value;
                    setDomains(updated);
                  }}
                />
                <input
                  placeholder="inputs"
                  className="border p-1 rounded"
                  value={m.inputs}
                  onChange={(e) => {
                    const updated = [...domains];
                    updated[domainIndex].methods[i].inputs = e.target.value;
                    setDomains(updated);
                  }}
                />
                <input
                  placeholder="output"
                  className="border p-1 rounded"
                  value={m.output}
                  onChange={(e) => {
                    const updated = [...domains];
                    updated[domainIndex].methods[i].output = e.target.value;
                    setDomains(updated);
                  }}
                />
              </div>
            ))}
            <button
              className="text-sm text-blue-600"
              onClick={() => {
                const updated = [...domains];
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
        className="text-sm text-green-500 border border-green-500 py-1 px-3 rounded w-fit"
        onClick={addDomain}
      >
        + ドメインを追加
      </button>

      <h2 className="text-xl font-semibold mt-12">ユースケース定義</h2>

      {usecases.map((u, i) => (
        <div key={i} className="border p-4 rounded-md flex flex-col gap-4 bg-zinc-900">
          <input
            className="border p-2 rounded"
            placeholder="ユースケース名"
            value={u.name}
            onChange={(e) => {
              const updated = [...usecases];
              updated[i].name = e.target.value;
              setUsecases(updated);
            }}
          />

          <div className="flex flex-col gap-2">
            <span>入力</span>
            {u.inputFields.map((f, fi) => (
              <div key={fi} className="flex gap-2">
                <select
                  className="border p-1 rounded"
                  value={f.name}
                  onChange={(e) => {
                    const updated = [...usecases];
                    updated[i].inputFields[fi].name = e.target.value;
                    setUsecases(updated);
                  }}
                >
                  <option value="">選択</option>
                  {domainOptions.map((field, idx) => (
                    <option key={idx} value={field}>{field}</option>
                  ))}
                </select>
              </div>
            ))}
            <button
              className="text-sm text-blue-600"
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
            <span>出力</span>
            {u.outputFields.map((f, fi) => (
              <div key={fi} className="flex gap-2">
                <select
                  className="border p-1 rounded"
                  value={f.name}
                  onChange={(e) => {
                    const updated = [...usecases];
                    updated[i].outputFields[fi].name = e.target.value;
                    setUsecases(updated);
                  }}
                >
                  <option value="">選択</option>
                  {domainOptions.map((field, idx) => (
                    <option key={idx} value={field}>{field}</option>
                  ))}
                </select>
              </div>
            ))}
            <button
              className="text-sm text-blue-600"
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
        className="text-sm text-green-500 border border-green-500 py-1 px-3 rounded w-fit"
        onClick={addUsecase}
      >
        + ユースケースを追加
      </button>

      <button
        className="bg-black text-white px-4 py-2 rounded mt-4"
        onClick={handleSubmit}
      >
        プロジェクト生成
      </button>
    </div>
  );
}