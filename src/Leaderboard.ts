import Redis = require("redis");

export enum SortOrders {
    Ascending = 0,
    Descending = 1
}

export interface ILeaderboardCallback<T> {
    (error: any, result: T);
}

export interface IRankWithScoresResult {
    rank: number;
    score: number;
}

export interface ILeaderboardOptions {
    name: string;
    pageSize: number;
    sortOrder: number;
}

export interface IRedisOptions {
    host: string;
    port: number;
    db: string;
}

export class Leaderboard {
    private leaderboardName: string;
    private leaderboardOptions: ILeaderboardOptions;
    private redisOptions: IRedisOptions;
    private client: Redis.RedisClient;

    public static DEFAULT_PAGE_SIZE: number = 50;
    public static DEFAULT_REDIS_HOST: string = "localhost";
    public static DEFAULT_REDIS_PORT: number = 6379
    public static DEFAULT_SORT_ORDER: number = SortOrders.Ascending;

    /**
     * Create a new instance of a leaderboard.
     * 
     * @constructor
     * @param {string} name
     * @param {ILeaderboardOptions} leaderboardOptions - Options for the leaderboard such as pageSize, etc.
     * @param {IRedisOptions} redisOptions - Redis configuration options.
     * 
     * Example:
     *  var leaderboard = new Leaderboard('MyLeaderboard', {pageSize:30}, {port:6379, host:'127.0.0.1'});
     *  var leaderboard = new Leaderboard('Scores');
     **/
    constructor(leaderboardName: string, leaderboardOptions?: ILeaderboardOptions, redisOptions?: IRedisOptions) {
        this.leaderboardName = leaderboardName;
        this.leaderboardOptions = leaderboardOptions;
        this.redisOptions = redisOptions;

        if (!redisOptions.host) {
            this.redisOptions.host = Leaderboard.DEFAULT_REDIS_HOST;
        }

        if (!redisOptions.port) {
            this.redisOptions.port = Leaderboard.DEFAULT_REDIS_PORT;
        }

        if (!leaderboardOptions.pageSize || leaderboardOptions.pageSize < 0) {
            this.leaderboardOptions.pageSize = Leaderboard.DEFAULT_PAGE_SIZE;
        }

        if (!leaderboardOptions.sortOrder) {
            this.leaderboardOptions.sortOrder = Leaderboard.DEFAULT_SORT_ORDER;
        }

        this.client = Redis.createClient(redisOptions.port, redisOptions.host);
    }

    /**
     * pageSize getter
     * 
     * @returns {number}
     */
    public get pageSize(): number {
        return this.leaderboardOptions.pageSize;
    }

    /*
     * Set the page size to be used when paging through the leaderboard.
     * 
     * @param {number} value
     */
    public set pageSize(value: number) {
        if (value !== this.leaderboardOptions.pageSize) {
            this.leaderboardOptions.pageSize = value;
        }
    }

    /*
     * Delete the leaderboard. The result in the callback contains the number of keys that were removed.
     * Since the function deletes a single leaderboard, the result should be 1 on success.
     * 
     * @param {ILeaderboardCallback<number>} callback
     */
    public deleteLeaderboard(callback: ILeaderboardCallback<number>): void {
        this.client.del(this.leaderboardName, callback);
    }

    /*
     * Rank a member in the leaderboard
     * 
     * @param {String} member Member name.
     * @param {Number} score Member score.
     * @param {ILeaderboardCallback} callback
     */
    public rankMember(member: string, score: number, callback: ILeaderboardCallback<number>): void {
        this.client.zadd(this.leaderboardName, score, member, (error, result) => {
            return callback(error, result);
        });
    }

    /**
     * Remove a member from the named leaderboard.
     * 
     * @param {String} member
     * @param {ILeaderboardCallback} callback
     */
    public removeMemember(member: string, callback: ILeaderboardCallback<number>): void {
        this.client.zrem(this.leaderboardName, member, callback);
    }

    /**
     * Retrieve the total number of members in the leaderboard.
     * 
     * @param {ILeaderboardCallback} callback
     */
    public memberCount(callback: ILeaderboardCallback<number>): void {
        return this.client.zcard(this.leaderboardName, callback);
    }

    /*
     * Retrieves the member count  within gived score range.
     * 
     * @param {Number} minScore Minimum score
     * @param {Number} maxScore Maximun score
     * @param {ILeaderboardCallback} callback
     */
    public memberCountInRange(minScore: number, maxScore: number, callback: ILeaderboardCallback<number>): void {
        this.client.zcount(this.leaderboardName, minScore, maxScore, callback);
    }


    /*
    * Retrieve the total number of pages in the leaderboard. 
    * This overload of the function uses the default page size when calculating the total number of pages
    * 
    * @param {ILeaderboardCallback} callback
    */
    public pageCount(callback: ILeaderboardCallback<number>): void;

    /*
    * Retrieves the total number of pages in the leaderboard.
    * 
    * @param {Number} pageSize Page size to be used when calculating the total number of pages.
    * @param {ILeaderboardCallback} callback
    */
    public pageCount(pageSize: number, callback: ILeaderboardCallback<number>): void;

    public pageCount(param1: any, param2?: any): void {
        var pageSize;
        var callback;
        if (param1 && typeof param1 == 'function') {
            callback = param1;
            pageSize = this.pageSize;
        } else {
            pageSize = param1;
            callback = param2;
        }

        return this.client.zcard(this.leaderboardName, (error, result) =>
            callback(error, Math.ceil(result / pageSize)));
    }

    getRankFor(member: string, callback: ILeaderboardCallback<number>): void {
        var response = (error, result) => {
            if (result != null) {
                return callback(error, result + 1);
            } else {
                return callback(null, null);
            }
        };

        if (this.leaderboardOptions.sortOrder === SortOrders.Descending) {
            return this.client.zrank(this.leaderboardName, member, response);
        } else {
            return this.client.zrevrank(this.leaderboardName, member, response);
        }
    }

    getScoreFor(member: string, callback: ILeaderboardCallback<number>): void {
        return this.client.zscore(this.leaderboardName, member, (error, result) => {
            if (error == null) {
                return callback(error, parseFloat(result));
            } else {
                return callback(null, null);
            }
        });
    }

    /*
     * Retrieves both the rank and score for the member.
     * 
     * @param {String} member
     * @param {ILeaderboardCallback<IRankWithScoresResult>} callback
     */
    public getRankWithScoreFor(member: string, callback: ILeaderboardCallback<IRankWithScoresResult>): void {
        var response = (error, replies) => {
            console.log(error, replies);
            if (error != null) {
                return callback(null, null);
            } else {
                return callback(error, <IRankWithScoresResult>{ rank: replies[1] + 1, score: replies[0]});
            }
        };

        var transaction = this.client.multi();
        transaction.zscore(this.leaderboardName, member);
        if (this.leaderboardOptions.sortOrder == SortOrders.Descending) {
            transaction.zrank(this.leaderboardName, member);
        } else {
            transaction.zrevrank(this.leaderboardName, member);
        }

        transaction.exec((error, replies) => {
            return response(error, replies);
        });
    }

    getPageFor(member: string, callback: ILeaderboardCallback<number>): void;
    getPageFor(member: string, pageSize: number, callback: ILeaderboardCallback<number>): void;
    getPageFor(member: string, param2: any, param3?: any) {
        var callback: Function;
        var pageSize: number;
        if (param2 && typeof param2 == 'function') {
            callback = param2;
            pageSize = this.pageSize;
        } else {
            pageSize = param2;
            callback = param3;
        }

        var transaction = this.client.multi();
        transaction.zrank(this.leaderboardName, member);
        transaction.exec((error, replies) => {
            var rank = replies[0];
            if (rank == null) {
                rank = 0;
            } else {
                rank += 1;
            }

            var result = Math.ceil(rank / pageSize);
            return callback(error, result);
        });
    }

    public getTop(count: number, callback: ILeaderboardCallback<string>): void;
    public getTop(offset: number, count: number, callback: ILeaderboardCallback<string>): void;
    public getTop(param1: number, param2?: any, param3?: any): void {
        //
    }
}