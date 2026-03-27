import { Test, TestingModule } from "@nestjs/testing";
import { SurrealService } from "./surreal.service";

describe("SurrealService", () => {
  let service: SurrealService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SurrealService],
    }).compile();

    // Prevent auto-connect in tests
    service = module.get<SurrealService>(SurrealService);
  });

  describe("connection state", () => {
    it("should report not connected before init", () => {
      expect(service.isConnected()).toBe(false);
    });
  });

  describe("parseSqlStatements (via runMigration internals)", () => {
    // Access the private method for unit testing SQL parsing logic
    const parse = (sql: string): string[] => {
      const svc = new SurrealService();
      return (svc as any).parseSqlStatements(sql);
    };

    it("should split simple statements on semicolons", () => {
      const stmts = parse("CREATE foo; CREATE bar;");
      expect(stmts).toEqual(["CREATE foo", "CREATE bar"]);
    });

    it("should handle statements without trailing semicolons", () => {
      const stmts = parse("CREATE foo; CREATE bar");
      expect(stmts).toEqual(["CREATE foo", "CREATE bar"]);
    });

    it("should skip empty statements", () => {
      const stmts = parse("CREATE foo;   ;  ; CREATE bar;");
      expect(stmts).toEqual(["CREATE foo", "CREATE bar"]);
    });

    it("should skip comment-only statements", () => {
      const stmts = parse("-- this is a comment; CREATE foo;");
      // The part before ; is "-- this is a comment" which starts with -- and should be skipped
      expect(stmts).toEqual(["CREATE foo"]);
    });

    it("should respect braces for DEFINE FUNCTION bodies", () => {
      const sql = `DEFINE FUNCTION fn::test() { RETURN 1; }; CREATE bar;`;
      const stmts = parse(sql);
      expect(stmts).toHaveLength(2);
      expect(stmts[0]).toContain("DEFINE FUNCTION");
      expect(stmts[0]).toContain("RETURN 1;");
      expect(stmts[1]).toBe("CREATE bar");
    });

    it("should handle nested braces in function bodies", () => {
      const sql = `DEFINE FUNCTION fn::test() { IF true { RETURN 1; } ELSE { RETURN 2; }; }; SELECT 1;`;
      const stmts = parse(sql);
      expect(stmts).toHaveLength(2);
      expect(stmts[0]).toContain("IF true");
    });
  });

  describe("coerceDatetimes", () => {
    const coerce = (data: unknown): unknown => {
      const svc = new SurrealService();
      return (svc as any).coerceDatetimes(data);
    };

    it("should convert ISO date strings to Date objects", () => {
      const result = coerce("2026-03-25T12:00:00.000Z");
      expect(result).toBeInstanceOf(Date);
    });

    it("should not convert non-date strings", () => {
      expect(coerce("hello world")).toBe("hello world");
      expect(coerce("not-a-date")).toBe("not-a-date");
    });

    it("should recursively convert dates in objects", () => {
      const result = coerce({
        created_at: "2026-03-25T12:00:00Z",
        name: "test",
      }) as Record<string, unknown>;
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.name).toBe("test");
    });

    it("should recursively convert dates in arrays", () => {
      const result = coerce(["2026-03-25T12:00:00Z", "hello"]) as unknown[];
      expect(result[0]).toBeInstanceOf(Date);
      expect(result[1]).toBe("hello");
    });

    it("should pass through null and undefined", () => {
      expect(coerce(null)).toBeNull();
      expect(coerce(undefined)).toBeUndefined();
    });

    it("should pass through Date objects unchanged", () => {
      const d = new Date();
      expect(coerce(d)).toBe(d);
    });

    it("should pass through numbers unchanged", () => {
      expect(coerce(42)).toBe(42);
    });
  });

  describe("auth retry", () => {
    it("re-authenticates and retries a query once when the auth token expires", async () => {
      const svc = new SurrealService();
      const query = jest
        .fn()
        .mockRejectedValueOnce(
          new Error("HttpConnectionError: The token has expired"),
        )
        .mockResolvedValueOnce([[{ ok: true }]]);
      const signin = jest.fn().mockResolvedValue(undefined);
      const use = jest.fn().mockResolvedValue(undefined);

      (svc as any).db = {
        query,
        signin,
        use,
      };
      (svc as any).config = {
        url: "http://127.0.0.1:8000/rpc",
        namespace: "deus",
        database: "runtime",
        username: "root",
        password: "root",
      };

      const result = await svc.query("RETURN true");

      expect(result.isOk()).toBe(true);
      expect(query).toHaveBeenCalledTimes(2);
      expect(signin).toHaveBeenCalledTimes(1);
      expect(use).toHaveBeenCalledTimes(1);
    });
  });
});
