"""Local body-feature agreement; inlier counts are not identity probabilities."""
import cv2
import numpy as np

sift=cv2.SIFT_create(nfeatures=160,contrastThreshold=.025)
bf=cv2.BFMatcher(cv2.NORM_L2)
def features(image):
    if image is None or image.size == 0:return ([],None)
    gray=cv2.cvtColor(cv2.resize(image,(128,128)),cv2.COLOR_BGR2GRAY);mask=np.zeros_like(gray);mask[18:121,10:118]=255
    return sift.detectAndCompute(gray,mask)
def compare(a,b):
    ka,da=a;kb,db=b
    if da is None or db is None or len(da)<8 or len(db)<8:return 0
    pairs=bf.knnMatch(da,db,k=2);good=[m for m,n in pairs if m.distance<.70*n.distance]
    if len(good)<8:return 0
    # One-to-one correspondences; repetitive background must not inflate support.
    good=sorted(good,key=lambda m:m.distance);seen=set();unique=[]
    for m in good:
        if m.trainIdx not in seen:seen.add(m.trainIdx);unique.append(m)
    if len(unique)<8:return 0
    src=np.float32([ka[m.queryIdx].pt for m in unique]);dst=np.float32([kb[m.trainIdx].pt for m in unique]);matrix,mask=cv2.estimateAffinePartial2D(src,dst,method=cv2.RANSAC,ransacReprojThreshold=3,maxIters=1000)
    if matrix is None:return 0
    count=int(mask.sum());scale=float(np.linalg.norm(matrix[:,0]))
    if count<8 or count/len(unique)<.8 or not .6<=scale<=1.6:return 0
    points=src[mask.ravel().astype(bool)]
    if np.ptp(points[:,0])<25 or np.ptp(points[:,1])<30:return 0
    return count
