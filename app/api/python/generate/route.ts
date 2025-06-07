import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';

// プリミティブ型の定義
const PRIMITIVE_TYPES = ['str', 'int', 'float', 'bool', 'datetime', 'list', 'dict', 'set', 'any'];

// Load and compile Handlebars template
const loadTemplate = (templatePath: string): HandlebarsTemplateDelegate => {
    const fullPath = path.join(process.cwd(), 'templates', templatePath);
    try {
        const source = fs.readFileSync(fullPath, 'utf-8');
        return Handlebars.compile(source);
    } catch (error) {
        console.error(`Error loading template ${templatePath}:`, error);
        return Handlebars.compile('# Error loading template\n');
    }
};

const entityTemplate = loadTemplate('python/domain/entity.hbs');
const valueObjectTemplate = loadTemplate('python/domain/valueObject.hbs');
const domainServiceTemplate = loadTemplate('python/domain/domain_service.hbs');
const repositoryTemplate = loadTemplate('python/domain/repository.hbs');
const usecaseTemplate = loadTemplate('python/usecase/usecase.hbs');
const actionTemplate = loadTemplate('python/adapter/action.hbs');
const presenterTemplate = loadTemplate('python/adapter/presenter.hbs');
const repositoryNoSqlTemplate = loadTemplate('python/adapter/repository_nosql.hbs');
const repositorySqlTemplate = loadTemplate('python/adapter/repository_sql.hbs');
const noSqlTemplate = loadTemplate('python/adapter/nosql.hbs');
const sqlTemplate = loadTemplate('python/adapter/sql.hbs');
const noSqlInfrastructureTemplate = loadTemplate('python/infrastructure/nosql.hbs');
const sqlInfrastructureTemplate = loadTemplate('python/infrastructure/sql.hbs');
const domainServiceImplTemplate = loadTemplate('python/infrastructure/domain_service_impl.hbs');
const entityImplTemplate = loadTemplate('python/infrastructure/entity_impl.hbs');
const valueObjectImplTemplate = loadTemplate('python/infrastructure/valueObject.hbs');

// リポジトリのメソッド定義
const createRepositoryMethods = (domainName: string, varName: string) => [
    {
        name: 'find_by_id',
        inputs: ['id: UUID'],
        output: `Optional[${domainName}]`
    },
    {
        name: 'save',
        inputs: [`entity: ${domainName}`],
        output: 'None'
    },
    {
        name: 'delete',
        inputs: ['id: UUID'],
        output: 'None'
    },
    {
        name: 'find_all',
        inputs: [],
        output: `List[${domainName}]`
    }
];

const generateDomainFileContent = (domain: any, allDomains: any[], language: string): string => {
    const dependencies: string[] = [];

    domain.attributes.forEach((attr: any) => {
        dependencies.push(attr.type);
    });

    domain.methods.forEach((method: any) => {
        const inputTypes = method.inputs.split(',').map((s: string) => s.trim()).filter(Boolean);
        inputTypes.forEach((type: string) => dependencies.push(type));
        dependencies.push(method.output.trim());
    });

    const uniqueDependencies = Array.from(new Set(dependencies))
        .filter(dep => !PRIMITIVE_TYPES.includes(dep))
        .map(dep => ({
            name: dep.charAt(0).toUpperCase() + dep.slice(1),
            from: `./${dep.charAt(0).toLowerCase() + dep.slice(1)}`
        }));

    const propertiesData = domain.attributes.map((attr: any) => ({
        name: attr.name,
        type: PRIMITIVE_TYPES.includes(attr.type.toLowerCase()) 
            ? attr.type.toLowerCase() 
            : attr.type.charAt(0).toUpperCase() + attr.type.slice(1),
        optional: attr.optional || false
    }));

    const methodsData = domain.methods.map((method: any) => ({
        name: method.name,
        inputs: method.inputs.split(',').map((s: string) => s.trim()).filter(Boolean).map((type: string) => 
            PRIMITIVE_TYPES.includes(type.toLowerCase())
                ? type.toLowerCase()
                : type.charAt(0).toUpperCase() + type.slice(1)
        ),
        output: method.output.trim().toLowerCase() === 'str' || 
                method.output.trim().toLowerCase() === 'int' || 
                method.output.trim().toLowerCase() === 'float' || 
                method.output.trim().toLowerCase() === 'bool' || 
                method.output.trim().toLowerCase() === 'datetime' || 
                method.output.trim().toLowerCase() === 'list' || 
                method.output.trim().toLowerCase() === 'dict' || 
                method.output.trim().toLowerCase() === 'set' || 
                method.output.trim().toLowerCase() === 'any'
            ? method.output.trim().toLowerCase()
            : method.output.trim().charAt(0).toUpperCase() + method.output.trim().slice(1),
    }));

    const templateData = {
        name: domain.name.charAt(0).toUpperCase() + domain.name.slice(1),
        imports: uniqueDependencies,
        properties: propertiesData,
        methods: methodsData,
        domainType: domain.domainType,
    };

    if (domain.domainType === 'entity') {
        return entityTemplate(templateData);
    } else if (domain.domainType === 'valueObject') {
        return valueObjectTemplate(templateData);
    } else if (domain.domainType === 'domainService') {
        return domainServiceTemplate(templateData);
    }

    return '';
};

const generateRepositoryContent = (domain: any, language: string): string => {
    const domainName = domain.name.charAt(0).toUpperCase() + domain.name.slice(1);
    const varName = domainName.charAt(0).toLowerCase() + domainName.slice(1);

    // リポジトリで必要となるエンティティのインポート情報を生成
    const imports = [];
    // エンティティ名（先頭大文字）
    const entityTypeName = domainName.charAt(0).toUpperCase() + domainName.slice(1);
    // インポート元のファイルパス（先頭小文字）
    const entityFileName = domainName.charAt(0).toLowerCase() + domainName.slice(1);

    imports.push({
        name: entityTypeName,
        from: `./${entityFileName}`,
    });

    const templateData = {
        name: `${domainName}Repository`,
        imports: imports,
        methods: createRepositoryMethods(domainName, varName),
        entityName: entityTypeName
    };

    return repositoryTemplate(templateData);
};

const generateUsecaseContent = (usecase: any, allDomains: any[], language: string): string => {
    const usecaseName = usecase.name.charAt(0).toUpperCase() + usecase.name.slice(1);
    const inputClassName = `${usecaseName}Input`;
    const outputClassName = `${usecaseName}Output`;
    const usecaseClassName = `${usecaseName}UseCase`;

    // 名前の先頭を大文字にする関数
    const toTypeName = (name: string): string =>
        name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Any';

    const normalizeFields = (fields: any[]) =>
        (fields || []).map(f => {
            const type = toTypeName(f.name);
            return { name: f.name, type };
        });

    const inputFields = normalizeFields(usecase.inputFields);
    const outputFields = normalizeFields(usecase.outputFields);

    // import対象型を抽出（重複除去）
    const typeNames = Array.from(new Set([
        ...inputFields.map(f => f.type),
        ...outputFields.map(f => f.type),
    ]));

    const imports = typeNames
        .filter(type => !PRIMITIVE_TYPES.includes(type)) // primitive除外
        .map(type => ({
            name: type,
            from: `../domain/${type.toLowerCase()}`,
        }));

    const templateData = {
        imports,
        inputClass: {
            name: inputClassName,
            fields: inputFields,
        },
        outputClass: {
            name: outputClassName,
            fields: outputFields,
        },
        presenter: {
            name: `${usecaseName}Presenter`,
        },
        usecaseClass: {
            name: usecaseClassName,
        },
        repository: {
            type: `${outputFields[0].name}Repository`,
        },
    };

    // リポジトリのインポートを追加 (型名を大文字化して使用)
    if (outputFields.length > 0) {
        const repoTypeName = `${outputFields[0].type}Repository`;
        const repoFileName = `${outputFields[0].type.charAt(0).toLowerCase() + outputFields[0].type.slice(1)}repository`;
        imports.push({
            name: repoTypeName,
            from: `../domain/${repoFileName}`,
        });
    }

    return usecaseTemplate(templateData);
};

const generateActionContent = (usecase: any, language: string): string => {
    const usecaseName = usecase.name.charAt(0).toUpperCase() + usecase.name.slice(1);
    const endpoint = usecase.name.toLowerCase();

    const templateData = {
        name: usecaseName,
        endpoint,
        usecaseName: `${usecaseName}UseCase`,
        presenterName: `${usecaseName}Presenter`,
        requestProperties: (usecase.inputFields || []).map((f: any) => ({
            name: f.name,
            type: f.type ? f.type.toLowerCase() : 'str'
        })),
        responseProperties: (usecase.outputFields || []).map((f: any) => ({
            name: f.name,
            type: f.type ? f.type.toLowerCase() : 'str'
        }))
    };

    return actionTemplate(templateData);
};

const generatePresenterContent = (usecase: any, language: string): string => {
    const usecaseName = usecase.name.charAt(0).toUpperCase() + usecase.name.slice(1);

    const templateData = {
        name: `${usecaseName}Presenter`,
        responseProperties: (usecase.outputFields || []).map((f: any) => ({
            name: f.name,
            type: f.type ? f.type.toLowerCase() : 'str'
        }))
    };

    return presenterTemplate(templateData);
};

const generateRepositorySqlContent = (domain: any, language: string): string => {
    const domainName = domain.name.charAt(0).toUpperCase() + domain.name.slice(1);
    const entityImplName = `${domainName}Impl`;

    const templateData = {
        name: `${domainName}SqlRepository`,
        entityName: domainName,
        entityImplName,
        repositoryName: `${domainName}Repository`,
        sqlImplName: `${domainName}SqlImpl`
    };

    return repositorySqlTemplate(templateData);
};

const generateRepositoryNoSqlContent = (domain: any, language: string): string => {
    const domainName = domain.name.charAt(0).toUpperCase() + domain.name.slice(1);
    const entityImplName = `${domainName}Impl`;

    const templateData = {
        name: `${domainName}NoSqlRepository`,
        entityName: domainName,
        entityImplName,
        repositoryName: `${domainName}Repository`,
        noSqlImplName: `${domainName}NoSqlImpl`,
        collectionName: domain.name.toLowerCase()
    };

    return repositoryNoSqlTemplate(templateData);
};

const generateSqlContent = (domain: any, language: string): string => {
    const domainName = domain.name.charAt(0).toUpperCase() + domain.name.slice(1);
    const entityImplName = `${domainName}Impl`;

    const templateData = {
        name: `${domainName}Sql`,
        entityName: domainName,
        entityImplName,
        repositoryName: `${domainName}Repository`,
        sqlImplName: `${domainName}SqlImpl`
    };

    return sqlTemplate(templateData);
};

const generateNoSqlContent = (domain: any, language: string): string => {
    const domainName = domain.name.charAt(0).toUpperCase() + domain.name.slice(1);
    const entityImplName = `${domainName}Impl`;

    const templateData = {
        name: `${domainName}NoSql`,
        entityName: domainName,
        entityImplName,
        repositoryName: `${domainName}Repository`,
        noSqlImplName: `${domainName}NoSqlImpl`,
        collectionName: domain.name.toLowerCase()
    };

    return noSqlTemplate(templateData);
};

const generateEntityImplContent = (domain: any, language: string): string => {
    const domainName = domain.name.charAt(0).toUpperCase() + domain.name.slice(1);
    const entityImplName = `${domainName}Impl`;

    const propertiesData = domain.attributes.map((attr: any) => ({
        name: attr.name,
        type: PRIMITIVE_TYPES.includes(attr.type.toLowerCase()) 
            ? attr.type.toLowerCase() 
            : attr.type.charAt(0).toUpperCase() + attr.type.slice(1),
        optional: attr.optional || false
    }));

    const templateData = {
        name: entityImplName,
        entityName: domainName,
        properties: propertiesData
    };

    return entityImplTemplate(templateData);
};

const generateValueObjectImplContent = (domain: any, language: string): string => {
    const domainName = domain.name.charAt(0).toUpperCase() + domain.name.slice(1);
    const valueObjectImplName = `${domainName}Impl`;

    const propertiesData = domain.attributes.map((attr: any) => ({
        name: attr.name,
        type: PRIMITIVE_TYPES.includes(attr.type.toLowerCase()) 
            ? attr.type.toLowerCase() 
            : attr.type.charAt(0).toUpperCase() + attr.type.slice(1)
    }));

    const templateData = {
        name: valueObjectImplName,
        valueObjectName: domainName,
        properties: propertiesData
    };

    return valueObjectImplTemplate(templateData);
};

const generateDomainServiceImplContent = (domain: any, language: string): string => {
    const domainName = domain.name.charAt(0).toUpperCase() + domain.name.slice(1);
    const domainServiceImplName = `${domainName}ServiceImpl`;

    const templateData = {
        name: domainServiceImplName,
        domainServiceName: `${domainName}Service`,
        entityName: domainName
    };

    return domainServiceImplTemplate(templateData);
};

const generateSqlInfrastructureContent = (domain: any, language: string): string => {
    const domainName = domain.name.charAt(0).toUpperCase() + domain.name.slice(1);
    const sqlImplName = `${domainName}SqlImpl`;

    const templateData = {
        name: sqlImplName,
        entityName: domainName,
        entityImplName: `${domainName}Impl`,
        repositoryName: `${domainName}Repository`
    };

    return sqlInfrastructureTemplate(templateData);
};

const generateNoSqlInfrastructureContent = (domain: any, language: string): string => {
    const domainName = domain.name.charAt(0).toUpperCase() + domain.name.slice(1);
    const noSqlImplName = `${domainName}NoSqlImpl`;

    const templateData = {
        name: noSqlImplName,
        entityName: domainName,
        entityImplName: `${domainName}Impl`,
        repositoryName: `${domainName}Repository`,
        collectionName: domain.name.toLowerCase()
    };

    return noSqlInfrastructureTemplate(templateData);
};

export async function POST(req: NextRequest) {
    const { projectName, language, domains, usecases } = await req.json();

    if (language !== 'python') {
        return new NextResponse(JSON.stringify({ error: 'Only Python is supported for code generation.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const zip = new JSZip();
    const projectFolder = zip.folder(projectName || 'project');
    const domainFolder = projectFolder?.folder('domain');
    const usecaseFolder = projectFolder?.folder('usecase');
    const adapterFolder = projectFolder?.folder('adapter');
    const infrastructureFolder = projectFolder?.folder('infrastructure');

    if (domainFolder) {
        domains.forEach((domain: any) => {
            const domainFileName = `${domain.name}.py`;
            domainFolder.file(domainFileName, generateDomainFileContent(domain, domains, language));

            if (domain.domainType === 'entity') {
                const repoFileName = `${domain.name}Repository.py`;
                domainFolder.file(repoFileName, generateRepositoryContent(domain, language));
            }
        });
    }

    if (usecaseFolder) {
        usecases.forEach((usecase: any) => {
            const usecaseFileName = `${usecase.name}UseCase.py`;
            usecaseFolder.file(usecaseFileName, generateUsecaseContent(usecase, domains, language));
        });
    }

    // Actionファイルを生成してadapter/apiフォルダに追加
    const apiAdapterFolder = adapterFolder ? adapterFolder.folder('api') : null;
    if (apiAdapterFolder) {
        usecases.forEach((usecase: any) => {
            const actionFileName = `${usecase.name}Action.py`;
            const templateData = {
                name: usecase.name,
                endpoint: usecase.name.toLowerCase(),
                usecaseName: `${usecase.name}UseCase`,
                presenterName: `${usecase.name}Presenter`,
                requestProperties: (usecase.inputFields || []).map((f: any) => ({
                    name: f.name,
                    type: f.type ? f.type.toLowerCase() : 'str'
                })),
                responseProperties: (usecase.outputFields || []).map((f: any) => ({
                    name: f.name,
                    type: f.type ? f.type.toLowerCase() : 'str'
                }))
            };
            apiAdapterFolder.file(actionFileName, actionTemplate(templateData));
        });
    }

    // Presenterファイルを生成してadapter/presenterフォルダに追加
    const presenterAdapterFolder = adapterFolder ? adapterFolder.folder('presenter') : null;
    if (presenterAdapterFolder) {
        usecases.forEach((usecase: any) => {
            const presenterFileName = `${usecase.name}Presenter.py`;
            const templateData = {
                name: `${usecase.name}Presenter`,
                responseProperties: (usecase.outputFields || []).map((f: any) => ({
                    name: f.name,
                    type: f.type ? f.type.toLowerCase() : 'str'
                }))
            };
            presenterAdapterFolder.file(presenterFileName, presenterTemplate(templateData));
        });
    }

    if (adapterFolder) {
        const repositoryAdapterFolder = adapterFolder.folder('repository');
        if (repositoryAdapterFolder) {
            // NoSQLとSQLのデータベース接続クラスを生成
            repositoryAdapterFolder.file('NoSQL.py', noSqlTemplate({}));
            repositoryAdapterFolder.file('SQL.py', sqlTemplate({}));

            domains.forEach((domain: any) => {
                if (domain.domainType === 'entity') {
                    const domainName = domain.name;
                    const varName = domainName.charAt(0).toLowerCase() + domainName.slice(1);
                    
                    // NoSQLリポジトリの実装
                    const noSqlTemplateData = {
                        name: `${domainName}NoSqlRepository`,
                        entityName: domainName,
                        entityImplName: `${domainName}Impl`,
                        repositoryName: `${domainName}Repository`,
                        noSqlImplName: `${domainName}NoSqlImpl`,
                        collectionName: domain.name.toLowerCase()
                    };
                    repositoryAdapterFolder.file(`${domainName}NoSqlRepository.py`, repositoryNoSqlTemplate(noSqlTemplateData));

                    // SQLリポジトリの実装
                    const sqlTemplateData = {
                        name: `${domainName}SqlRepository`,
                        entityName: domainName,
                        entityImplName: `${domainName}Impl`,
                        repositoryName: `${domainName}Repository`,
                        sqlImplName: `${domainName}SqlImpl`
                    };
                    repositoryAdapterFolder.file(`${domainName}SqlRepository.py`, repositorySqlTemplate(sqlTemplateData));
                }
            });
        }
    }

    if (infrastructureFolder) {
        // domainフォルダの作成
        const domainFolder = infrastructureFolder.folder('domain');
        if (domainFolder) {
            domains.forEach((domain: any) => {
                const domainName = domain.name;
                const varName = domainName.charAt(0).toLowerCase() + domainName.slice(1);
                
                if (domain.domainType === 'entity') {
                    const entityImplContent = generateEntityImplContent(domain, language);
                    domainFolder.file(`${domainName}.py`, entityImplContent);
                } else if (domain.domainType === 'valueObject') {
                    const valueObjectImplContent = generateValueObjectImplContent(domain, language);
                    domainFolder.file(`${domainName}.py`, valueObjectImplContent);
                } else if (domain.domainType === 'domainService') {
                    const domainServiceImplContent = generateDomainServiceImplContent(domain, language);
                    domainFolder.file(`${domainName}.py`, domainServiceImplContent);
                }
            });
        }

        // databaseフォルダの作成
        const databaseFolder = infrastructureFolder.folder('database');
        if (databaseFolder) {
            // NoSQLとSQLのデータベース接続クラスを生成
            databaseFolder.file('NoSQL.py', noSqlInfrastructureTemplate({}));
            databaseFolder.file('SQL.py', sqlInfrastructureTemplate({}));
        }

        // routerフォルダの作成
        const routerFolder = infrastructureFolder.folder('router');
    }

    const content = await zip.generateAsync({ type: 'uint8array' });

    return new NextResponse(content, {
        status: 200,
        headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${projectName?.length ? projectName : 'project'}.zip"`,
        },
    });
} 