//// Saldoc.SplitOrderv2

function splitOrder(){

	var srcDocState =  parseInt(X.GETPARAM('srcDocState'));
	var dstDocState1 =  parseInt(X.GETPARAM('dstDocState1'));
	var dstDocState2 =  parseInt(X.GETPARAM('dstDocState2'));
	var srcDocPrinter =  X.GETPARAM('srcDocPrinter');
	var dstDocPrinter1 =  X.GETPARAM('dstDocPrinter1');
	var dstDocPrinter2 =  X.GETPARAM('dstDocPrinter2');
	var findoc =  X.GETPARAM('findoc')
	const finalfindocs = [];
	var ffindoc;
	const srcObj = X.CREATEOBJ("SALDOC");
	const dstObj2 = X.CREATEOBJ("SALDOC");
	const dstObj3 = X.CREATEOBJ("SALDOC");
	const addflag = X.CREATEOBJ("SALDOC");
	const printObj = X.CREATEOBJ("SALDOC");

	var sql = 'SELECT * ,IIF(PQTY1>0,0,1) AS P1 ,IIF(PQTY2>0,0,1) AS P2 ,IIF(PQTY3>0,0,1) AS P3 \
						,MIN(IIF(PQTY1>0,0,1)) OVER() AS MINP1 ,MIN(IIF(PQTY2>0,0,1)) OVER() AS MINP2 ,MIN(IIF(PQTY3>0,0,1)) OVER() AS MINP3 \
						FROM (SELECT M.MTRLINES ,M.FINDOC  ,M.MTRL ,M.QTY1 ,B.BAL1000 ,B.BALNOT1000, \
						CASE WHEN M.QTY1 <= B.BAL1000 THEN M.QTY1 \
								WHEN B.BAL1000 < 0 THEN 0  \
								ELSE B.BAL1000 \
						END AS PQTY1, \
						CASE WHEN (M.QTY1 - B.BAL1000) <= BALNOT1000 THEN \
										CASE WHEN (M.QTY1 - B.BAL1000) < 0 THEN 0 ELSE (M.QTY1 - B.BAL1000) END \
								WHEN BALNOT1000 < 0 THEN 0 \
								ELSE BALNOT1000 \
						END AS PQTY2, \
						CASE WHEN (M.QTY1 - B.BAL1000 - BALNOT1000) > 0 THEN M.QTY1 - B.BAL1000 - BALNOT1000 \
								ELSE 0  \
						END AS PQTY3 \
						FROM MTRLINES M \
								LEFT JOIN FINDOC ON M.FINDOC = FINDOC.FINDOC \
								LEFT OUTER JOIN ( \
										SELECT MB.MTRL \
										,ROUND(SUM((CASE WHEN MB.WHOUSE=1000 THEN ISNULL(MB.IMPQTY1, 0)-ISNULL(MB.EXPQTY1, 0) ELSE 0 END)),2) AS BAL1000 \
										,ROUND(SUM((CASE WHEN MB.WHOUSE!=1000 THEN ISNULL(MB.IMPQTY1, 0)-ISNULL(MB.EXPQTY1, 0) ELSE 0 END)),2) AS BALNOT1000 \
								FROM MTRBALSHEET MB \
								WHERE MB.COMPANY = :X.SYS.COMPANY \
										AND MB.FISCPRD = :X.SYS.FISCPRD \
										AND MB.PERIOD <= :X.SYS.PERIOD \
								GROUP BY MB.MTRL \
										) B ON B.MTRL=M.MTRL \
						WHERE ' + findoc + ')T1';
	ds = X.GETSQLDATASET(sql, null);

	if (ds.MINP1 == 0){
		updateLines(ds.MINP1, srcObj, 'P1', srcDocState, 0, 'PQTY1');
		updateLines(ds.MINP2, dstObj2, 'P2', dstDocState1, 1, 'PQTY2');
		updateLines(ds.MINP3, dstObj3, 'P3', dstDocState2, 1, 'PQTY3');
	} else {
		if (ds.MINP1 == 1 && ds.MINP2 == 0){
			updateLines(ds.MINP2, srcObj, 'P2', dstDocState1, 0, 'PQTY2');
			updateLines(ds.MINP3, dstObj3, 'P3', dstDocState2, 1, 'PQTY3');			
		}
		if (ds.MINP1 == 1 && ds.MINP2 == 1){
			updateLines(ds.MINP3, srcObj, 'P3', dstDocState2, 0, 'PQTY3');	
		}
	}

	// post objects
	postObj(srcObj, srcDocPrinter)
	postObj(dstObj2, dstDocPrinter1)
	postObj(dstObj3, dstDocPrinter2)

	// update με αυξον αριθμο και συνολο
	updateordernum(finalfindocs)
	printObj.FREE


	function updateLines(dsmin, obj, p, docState, copy, pqty){
		if (dsmin == 0){
			obj.DBLOCATE(ds.FINDOC);
			if (copy == 1) {
				obj.COPY;
				obj.DBINSERT;
				obj.PASTE;
			}
			obj.SALDOC.FINSTATES = docState || obj.SALDOC.FINSTATES;
			obj.ITELINES.FIRST;
			ds.FIRST;
			while(!ds.EOF()){
				if (ds[p] == 1){
					if (obj.ITELINES.LOCATE('MTRLINES', ds.MTRLINES)){
						obj.ITELINES.DELETE;
					}
				}	
				ds.NEXT;
			}		
			ds.FIRST
			while(!ds.EOF()){
				if (ds[p] == 0){
					if (obj.ITELINES.LOCATE('MTRLINES', ds.MTRLINES)){
						obj.ITELINES.QTY1 = ds[pqty];
						obj.ITELINES.cccitemsplit = countZeros(ds.p1, ds.p2, ds.p3, parseInt(p.slice(-1)));
					}
				}	
				ds.NEXT;
			}	
		}
	}
	
	function postObj(obj, printer){
		if (obj.ITELINES.RECORDCOUNT > 0){
			ffindoc = obj.DBPOST;
			finalfindocs.push([obj==srcObj?ds.FINDOC:ffindoc, printer]);
			obj.FREE;
		} else obj.FREE;
	}
	
	function updateordernum(finalfindocs){
		for (let i = 0; i < finalfindocs.length; i++) {
			addflag.DBLOCATE(finalfindocs[i][0]);
			addflag.SALDOC.CCCSPLITNUM = (i+1) + '\\' + finalfindocs.length;
			addflag.DBPOST;
			if (finalfindocs[i][1]){
				printObj.DBLOCATE(finalfindocs[i][0]);
				printObj.PRINTFORM(7005, finalfindocs[i][1], "");
			}
		}
		addflag.FREE;
	}
	
	function countZeros(p1, p2, p3, currentP) {
    var values = [p1, p2, p3];
    var zeros = [];
    var totalZeros = 0;
    for (var i = 0; i < values.length; i++) {
      if (values[i] === 0) {
        totalZeros++;
        zeros.push({ position: i + 1, fraction: totalZeros });
      }
    }
    for (var j = 0; j < zeros.length; j++) {
      if (zeros[j].position === currentP) {
        return zeros[j].fraction + "/" + totalZeros;
      }
    }
    return "";
	}

}
